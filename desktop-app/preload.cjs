// 预加载脚本：向页面暴露桌面能力（存在即为桌面版）
const { contextBridge, ipcRenderer } = require("electron");

function draftRequest(action, key, value) {
  const result = ipcRenderer.sendSync(`review-drafts:${action}`, key, value);
  if (!result?.ok) throw new Error(result?.error ?? "无法访问本机复盘草稿");
  return result.value ?? null;
}

function quickDraftRequest(action, value) {
  const result = ipcRenderer.sendSync(`quick-add:draft:${action}`, value);
  if (!result?.ok) throw new Error(result?.error ?? "无法访问快速录入草稿");
  return result.value ?? null;
}

contextBridge.exposeInMainWorld("workbench", {
  isDesktop: true,
  pickFile: () => ipcRenderer.invoke("dialog:pickFile"),
  openPath: (p) => ipcRenderer.invoke("shell:openPath", p),
  getAutoLaunch: () => ipcRenderer.invoke("autolaunch:get"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("autolaunch:set", enabled),
  backups: {
    getRestoreInfo: () => ipcRenderer.invoke("backups:restore-info"),
    restore: (name) => ipcRenderer.invoke("backups:restore", name),
  },
  quickAdd: {
    getState: () => ipcRenderer.invoke("quick-add:get"),
    setShortcut: (shortcut) => ipcRenderer.invoke("quick-add:set", shortcut),
    onOpen: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("quick-add:open", listener);
      ipcRenderer.send("quick-add:ready");
      return () => ipcRenderer.removeListener("quick-add:open", listener);
    },
    drafts: {
      getItem: () => quickDraftRequest("get"),
      setItem: (value) => { quickDraftRequest("set", value); },
      removeItem: () => { quickDraftRequest("remove"); },
    },
  },
  reviewDrafts: {
    getItem: (key) => draftRequest("get", key),
    setItem: (key, value) => { draftRequest("set", key, value); },
    removeItem: (key) => { draftRequest("remove", key); },
  },
});
