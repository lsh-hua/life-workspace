// Electron 主进程：内置 Next standalone 服务 + 窗口 + 托盘 + 开机自启
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage, screen, globalShortcut } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { randomUUID } = require("node:crypto");
const { createDraftStore } = require("./draft-store.cjs");
const { createQuickAdd } = require("./quick-add.cjs");

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let serverProcess = null;
let backupTimer = null;
let openingWindow = null;
let localAppOrigin = null;
let draftStore = null;
let quickAdd = null;
let quickAddReady = false;
let pendingQuickAdd = false;
let restoringBackup = false;
let cancelPendingRestore = null;
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

function runDataScript(script, args, env, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env, windowsHide: true });
    dataProcesses.add(child);
    let output = "";
    const timer = timeoutMs ? setTimeout(() => {
      child.kill();
      reject(new Error("数据检查或备份超过两分钟，请查看应用日志后重试"));
    }, timeoutMs) : null;
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
  const restoreScript = path.join(serverDir, "server", "restore-backup.mjs");
  if (!fs.existsSync(migrateScript) || !fs.existsSync(migrationsDir) || !fs.existsSync(restoreScript)) {
    throw new Error("数据库升级程序缺失，请重新安装完整应用");
  }
  await runDataScript(restoreScript, ["--recover"], { ...env, WORKBENCH_MIGRATIONS_DIR: migrationsDir });
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
  quickAddReady = false;
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
  mainWindow.webContents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) quickAddReady = false;
  });
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
    else cancelPendingRestore?.();
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
  if (restoringBackup) return;
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
      { label: "快速记录", click: () => { void openQuickAdd(); } },
      { label: "退出", click: () => app.quit() },
    ])
  );
  tray.on("click", openWindow);
}

async function openQuickAdd() {
  if (restoringBackup) return;
  pendingQuickAdd = true;
  await openWindow();
  if (quickAddReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("quick-add:open");
    pendingQuickAdd = false;
  }
}

function restoreInfoFile() {
  return path.join(app.getPath("userData"), "last-restore.json");
}

function readRestoreInfo() {
  try { return JSON.parse(fs.readFileSync(restoreInfoFile(), "utf8")); }
  catch { return null; }
}

function writeRestoreInfo(result) {
  const destination = restoreInfoFile();
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(result), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, destination);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("本地服务未能停止，恢复已中止。")), 10_000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    if (!child.kill()) { clearTimeout(timer); reject(new Error("本地服务未能停止，恢复已中止。")); }
  });
}

async function finishRestore(name) {
  if (backupTimer) { clearInterval(backupTimer); backupTimer = null; }
  await Promise.all([...dataProcesses].map(stopChild));
  await stopChild(serverProcess);
  serverProcess = null;
  const serverDir = path.join(process.resourcesPath, "app", "server");
  const dataDir = resolveDataDir();
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1", WORKBENCH_DATA_DIR: dataDir, WORKBENCH_MIGRATIONS_DIR: path.join(serverDir, "migrations") };
  const output = await runDataScript(path.join(serverDir, "restore-backup.mjs"), [name], env, 0);
  const line = output.split(/\r?\n/).find((value) => value.startsWith("RESTORE_RESULT="));
  if (!line) throw new Error("恢复结果无法确认；请保留全部数据目录。");
  const result = JSON.parse(line.slice("RESTORE_RESULT=".length));
  try { writeRestoreInfo(result); } catch (error) { log("恢复位置记录失败", error.message); }
  return result;
}

async function requestBackupRestore(event, name) {
  assertMainRequest(event);
  if (isDev) throw new Error("恢复向导仅在已安装的桌面版中可用。");
  if (restoringBackup) throw new Error("已有恢复操作正在进行。");
  if (typeof name !== "string" || !/^workbench-(manual|daily|migration)-[\dTZ.-]+-[a-f0-9]{8}\.db$/.test(name)) throw new Error("备份文件名无效。");
  restoringBackup = true;
  let choice;
  try {
    choice = await dialog.showMessageBox(mainWindow, {
      type: "warning", buttons: ["取消", "恢复此备份"], defaultId: 0, cancelId: 0,
      message: "恢复所选备份？",
      detail: `将关闭当前窗口并切换工作台数据。恢复前会创建完整快照，原数据目录和既有备份也会整体保留。\n\n所选备份：${name}`,
    });
  } catch (error) { restoringBackup = false; throw error; }
  if (choice.response !== 1 || !mainWindow) { restoringBackup = false; return { cancelled: true }; }
  const windowToClose = mainWindow;
  return new Promise((resolve) => {
    const cancel = () => {
      windowToClose.removeListener("closed", closed);
      cancelPendingRestore = null;
      restoringBackup = false;
      resolve({ cancelled: true });
    };
    const closed = async () => {
      cancelPendingRestore = null;
      try {
        const result = await finishRestore(name);
        restoringBackup = false;
        await openWindow();
        if (mainWindow) await dialog.showMessageBox(mainWindow, {
          type: "info", buttons: ["知道了"], message: "备份已恢复",
          detail: `恢复前的完整数据和备份保留在：\n${result.retainedDirectory}\n\n可在“数据与备份”中再次查看此位置。`,
        });
        resolve({ cancelled: false });
      } catch (error) {
        log("恢复备份失败", error.stack ?? error.message);
        restoringBackup = false;
        dialog.showErrorBox("备份恢复未完成", `${error.message}\n\n请保留所有数据目录，应用将尝试找回恢复前的数据。`);
        await openWindow();
        resolve({ cancelled: false, error: true });
      }
    };
    cancelPendingRestore = cancel;
    windowToClose.once("closed", closed);
    windowToClose.close();
  });
}

function assertMainRequest(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      new URL(event.senderFrame.url).origin !== localAppOrigin) throw new Error("桌面请求来源无效。");
}

function registerQuickAdd() {
  quickAdd = createQuickAdd(app.getPath("userData"), globalShortcut, () => { void openQuickAdd(); });
  ipcMain.handle("quick-add:get", (event) => { assertMainRequest(event); return quickAdd.getState(); });
  ipcMain.handle("quick-add:set", (event, shortcut) => { assertMainRequest(event); return quickAdd.setShortcut(shortcut); });
  ipcMain.on("quick-add:ready", (event) => {
    try {
      assertMainRequest(event);
      quickAddReady = true;
      if (pendingQuickAdd) { event.sender.send("quick-add:open"); pendingQuickAdd = false; }
    } catch (error) { log("快速录入来源校验失败", error.message); }
  });
  const methods = { get: "getDraft", set: "setDraft", remove: "removeDraft" };
  for (const [channel, method] of Object.entries(methods)) {
    ipcMain.on(`quick-add:draft:${channel}`, (event, value) => {
      try {
        assertMainRequest(event);
        event.returnValue = { ok: true, value: quickAdd[method](value) ?? null };
      } catch (error) {
        log("快速录入草稿存储失败", error.message);
        event.returnValue = { ok: false, error: "本机草稿读取或保存失败，请重试。" };
      }
    });
  }
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
  registerQuickAdd();
  ipcMain.handle("backups:restore-info", (event) => { assertMainRequest(event); return { supported: !isDev, last: readRestoreInfo() }; });
  ipcMain.handle("backups:restore", requestBackupRestore);
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
  const quickAddState = quickAdd.start();
  if (quickAddState.error) log("快速录入快捷键未就绪", quickAddState.error);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
}).catch(startupFailure);

app.on("window-all-closed", () => {
  if (!restoringBackup && process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  quickAdd?.stop();
  if (backupTimer) clearInterval(backupTimer);
  if (windowStateTimer) clearTimeout(windowStateTimer);
  for (const child of dataProcesses) child.kill();
  if (serverProcess) {
    try {
      spawn("taskkill", ["/PID", String(serverProcess.pid), "/T", "/F"], { windowsHide: true });
    } catch {}
  }
});
