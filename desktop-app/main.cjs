// Electron 主进程：内置 Next standalone 服务 + 窗口 + 托盘 + 开机自启
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let serverProcess = null;

function logFile() {
  try {
    return path.join(app.getPath("userData"), "app.log");
  } catch {
    return null;
  }
}
function log(...args) {
  const f = logFile();
  if (!f) return;
  try {
    fs.appendFileSync(f, `[${new Date().toISOString()}] ${args.join(" ")}\n`);
  } catch {}
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// 数据库目录：开发时用项目 data/，打包后用 userData/，并自动迁移旧数据
function resolveDataDir() {
  if (isDev) return path.join(__dirname, "..", "data");
  const dir = path.join(app.getPath("userData"), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const newDb = path.join(dir, "workbench.db");
  const oldDb = path.join(__dirname, "..", "data", "workbench.db");
  if (!fs.existsSync(newDb) && fs.existsSync(oldDb)) {
    try {
      fs.copyFileSync(oldDb, newDb);
    } catch {}
  }
  return dir;
}

async function startServer(port) {
  // 打包后：server 在 resources/app/server/server.js
  const serverDir = isDev
    ? path.join(__dirname, "..")
    : path.join(process.resourcesPath, "app");

  if (isDev) {
    // 开发模式：连外部已启动的 next dev（npm run dev）
    return;
  }
  const serverJs = path.join(serverDir, "server", "server.js");
  const dataDir = resolveDataDir();
  log("startServer: serverJs=", serverJs, "exists=", fs.existsSync(serverJs), "dataDir=", dataDir);
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    WORKBENCH_DATA_DIR: dataDir,
    NODE_ENV: "production",
    ELECTRON_RUN_AS_NODE: "1", // 用 Electron 内置的 Node 运行时跑 server
  };

  // 首启/升级：先跑数据库迁移（幂等）
  const migrateScript = path.join(serverDir, "server", "migrate.mjs");
  const migrationsDir = path.join(serverDir, "server", "migrations");
  if (fs.existsSync(migrateScript) && fs.existsSync(migrationsDir)) {
    log("running migrations...");
    await new Promise((resolve) => {
      const m = spawn(process.execPath, [migrateScript], {
        env: { ...env, WORKBENCH_MIGRATIONS_DIR: migrationsDir },
        windowsHide: true,
      });
      let out = "";
      m.stdout?.on("data", (d) => (out += d));
      m.stderr?.on("data", (d) => (out += d));
      m.on("exit", (code) => {
        log("migrate exit", code, out.slice(0, 2000));
        resolve();
      });
      m.on("error", (e) => {
        log("migrate error", String(e));
        resolve();
      });
    });
  } else {
    log("migrate script or migrations dir missing:", migrateScript, migrationsDir);
  }

  serverProcess = spawn(process.execPath, [serverJs], {
    env,
    windowsHide: true,
    cwd: path.dirname(serverJs),
  });
  serverProcess.stdout?.on("data", (d) => log("[server]", String(d).slice(0, 500)));
  serverProcess.stderr?.on("data", (d) => log("[server-err]", String(d).slice(0, 1000)));
  serverProcess.on("error", (e) => log("server spawn error", String(e)));
  serverProcess.on("exit", (code) => log("server exit", code));

  // 等待服务就绪
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/sites`);
      if (res.ok || res.status === 404) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function createWindow() {
  const port = await findFreePort();
  await startServer(port);
  const url = isDev ? "http://localhost:3000" : `http://127.0.0.1:${port}`;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "人生工作台",
    backgroundColor: "#fafafa",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 外链用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith("http")) shell.openExternal(u);
    return { action: "deny" };
  });

  mainWindow.on("close", (e) => {
    // 有关闭到托盘的习惯：默认直接退出（极简），托盘仅作入口
  });
  mainWindow.on("closed", () => (mainWindow = null));
  mainWindow.loadURL(url);
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("人生工作台");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开", click: () => (mainWindow ? mainWindow.show() : createWindow()) },
      { label: "退出", click: () => app.quit() },
    ])
  );
  tray.on("click", () => (mainWindow ? mainWindow.show() : createWindow()));
}

// ---- 开机自启 ----
function getAutoLaunch() {
  return app.getLoginItemSettings().openAtLogin;
}
function setAutoLaunch(enabled) {
  app.setLoginItemSettings({ openAtLogin: !!enabled });
}

app.whenReady().then(() => {
  ipcMain.handle("autolaunch:get", () => getAutoLaunch());
  ipcMain.handle("autolaunch:set", (_e, enabled) => {
    setAutoLaunch(enabled);
    return getAutoLaunch();
  });
  ipcMain.handle("dialog:pickFile", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "文档", extensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle("shell:openPath", (_e, p) => shell.openPath(p));

  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (serverProcess) {
    try {
      spawn("taskkill", ["/PID", String(serverProcess.pid), "/T", "/F"], { windowsHide: true });
    } catch {}
  }
});
