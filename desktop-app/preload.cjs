// 预加载脚本：向页面暴露桌面能力（存在即为桌面版）
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("workbench", {
  isDesktop: true,
  pickFile: () => ipcRenderer.invoke("dialog:pickFile"),
  openPath: (p) => ipcRenderer.invoke("shell:openPath", p),
  getAutoLaunch: () => ipcRenderer.invoke("autolaunch:get"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("autolaunch:set", enabled),
});
