// Electron 主进程：内置 Next standalone 服务 + 窗口 + 托盘 + 开机自启
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage, screen } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { randomUUID } = require("node:crypto");
const { createDraftStore } = require("./draft-store.cjs");

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let serverProcess = null;
let backupTimer = null;
let openingWindow = null;
let localAppOrigin = null;
let draftStore = null;
let windowStateTimer = null;
const dataProcesses = new Set();
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function windowStateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function isVisibleOnDisplay(bounds) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const width = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
    const height = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
    return width >= 120 && height >= 120;
  });
}

function readWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(windowStateFile(), "utf8"));
    const { x, y, width, height } = state.bounds ?? {};
    const valid = [x, y, width, height].every(Number.isFinite) &&
      width >= 960 && width <= 4000 && height >= 640 && height <= 3000;
    if (state.version !== 1 || !valid || !isVisibleOnDisplay({ x, y, width, height })) return null;
    return { bounds: { x, y, width, height }, maximized: state.maximized === true };
  } catch {
    return null;
  }
}

function saveWindowState(window) {
  if (window.isDestroyed()) return;
  const maximized = window.isMaximized();
  const bounds = maximized ? window.getNormalBounds() : window.getBounds();
  const file = windowStateFile();
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, bounds, maximized }), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    log("窗口状态保存失败", error.message);
  }
}

function queueWindowStateSave(window) {
  clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(() => saveWindowState(window), 300);
  windowStateTimer.unref();
}

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
    if (fs.existsSync(`${oldDb}-wal`)) throw new Error("检测到旧版数据仍在使用，请先关闭旧版应用后重试");
    fs.copyFileSync(oldDb, newDb, fs.constants.COPYFILE_EXCL);
  }
  return dir;
}

function runDataScript(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env, windowsHide: true });
    dataProcesses.add(child);
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("数据检查或备份超过两分钟，请查看应用日志后重试"));
    }, 120_000);
    const capture = (chunk) => { output = (output + String(chunk)).slice(-16_000); };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.once("error", (error) => {
      clearTimeout(timer);
      dataProcesses.delete(child);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      dataProcesses.delete(child);
      log("数据处理结束", path.basename(script), code, output);
      if (code === 0) resolve(output);
      else reject(new Error(`数据处理失败（退出码 ${code}）：${output}`));
    });
  });
}

async function startDailyBackups(script, env) {
  if (!fs.existsSync(script)) throw new Error("备份程序缺失，请重新安装完整应用");
  await runDataScript(script, ["--daily"], env);
  if (backupTimer) return;
  let running = false;
  backupTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runDataScript(script, ["--daily"], env);
    } catch (error) {
      log("每日自动备份失败", error.message);
    } finally {
      running = false;
    }
  }, 60 * 60 * 1000);
  backupTimer.unref();
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
  if (!fs.existsSync(migrateScript) || !fs.existsSync(migrationsDir)) {
    throw new Error("数据库升级程序缺失，请重新安装完整应用");
  }
  await runDataScript(migrateScript, [], { ...env, WORKBENCH_MIGRATIONS_DIR: migrationsDir });
  await startDailyBackups(path.join(serverDir, "server", "backup.mjs"), env);

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
    if (serverProcess.exitCode !== null) throw new Error("本地服务提前退出，请查看应用日志");
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/sites`, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 404) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("本地服务未能在 30 秒内就绪，请查看应用日志后重试");
}

async function createWindow() {
  const port = await findFreePort();
  await startServer(port);
  const url = isDev ? "http://localhost:3000" : `http://127.0.0.1:${port}`;
  localAppOrigin = new URL(url).origin;
  const savedState = readWindowState();

  mainWindow = new BrowserWindow({
    ...(savedState?.bounds ?? { width: 1280, height: 840 }),
    minWidth: 960,
    minHeight: 640,
    title: "人生工作台",
    backgroundColor: "#fafafa",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("resize", () => queueWindowStateSave(mainWindow));
  mainWindow.on("move", () => queueWindowStateSave(mainWindow));
  mainWindow.on("close", () => saveWindowState(mainWindow));

  // 外链用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith("http")) shell.openExternal(u);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "warning",
      buttons: ["继续编辑", "退出"],
      defaultId: 0,
      cancelId: 0,
      message: "内容尚未保存到数据库",
      detail: "退出前请确认页面显示的草稿和保存状态。选择继续编辑可返回页面检查。",
    });
    if (choice === 1) event.preventDefault();
  });

  mainWindow.on("closed", () => (mainWindow = null));
  await mainWindow.loadURL(url);
  if (savedState?.maximized) mainWindow.maximize();
  mainWindow.show();
}

function startupFailure(error) {
  log("应用启动失败", error.stack ?? error.message);
  dialog.showErrorBox("人生工作台启动失败", `为避免继续写入，应用已停止启动。\n${error.message}\n\n请保留数据与 backups 目录，详细原因见 ${logFile()}`);
  app.quit();
}

async function openWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  if (openingWindow) return openingWindow;
  openingWindow = createWindow().catch(startupFailure).finally(() => { openingWindow = null; });
  return openingWindow;
}

function registerDraftStorage() {
  draftStore = createDraftStore(path.join(app.getPath("userData"), "drafts"));
  const handlers = { get: "getItem", set: "setItem", remove: "removeItem" };
  for (const [channel, method] of Object.entries(handlers)) {
    ipcMain.on(`review-drafts:${channel}`, (event, key, value) => {
      try {
        if (!mainWindow || event.sender !== mainWindow.webContents ||
            event.senderFrame !== mainWindow.webContents.mainFrame ||
            new URL(event.senderFrame.url).origin !== localAppOrigin) {
          throw new Error("草稿请求来源无效");
        }
        const result = draftStore[method](key, value);
        event.returnValue = channel === "get" ? { ok: true, value: result } : { ok: true };
      } catch (error) {
        log("复盘草稿存储失败", error.message);
        event.returnValue = { ok: false, error: "复盘草稿读取或保存失败，请检查本地存储权限后重试" };
      }
    });
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
  if (icon.isEmpty()) log("托盘图标无法读取");
  tray = new Tray(icon);
  tray.setToolTip("人生工作台");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开", click: openWindow },
      { label: "退出", click: () => app.quit() },
    ])
  );
  tray.on("click", openWindow);
}

// ---- 开机自启 ----
function getAutoLaunch() {
  return app.getLoginItemSettings().openAtLogin;
}
function setAutoLaunch(enabled) {
  app.setLoginItemSettings({ openAtLogin: !!enabled });
}

if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", () => { void openWindow(); });

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  registerDraftStorage();
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

  await openWindow();
  if (mainWindow) createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
}).catch(startupFailure);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (backupTimer) clearInterval(backupTimer);
  if (windowStateTimer) clearTimeout(windowStateTimer);
  for (const child of dataProcesses) child.kill();
  if (serverProcess) {
    try {
      spawn("taskkill", ["/PID", String(serverProcess.pid), "/T", "/F"], { windowsHide: true });
    } catch {}
  }
});
