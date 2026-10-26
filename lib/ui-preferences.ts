export type ThemePreference = "system" | "light" | "dark";
type UiPreferences = { theme: ThemePreference; collapsed: boolean };

const DEFAULTS: UiPreferences = { theme: "system", collapsed: false };
const CHANGE_EVENT = "workbench:ui-preferences";
let snapshot = DEFAULTS;

function cookie(name: string) {
  return document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`))?.split("=")[1];
}

// 偏好 Cookie 按本机主机隔离但不按端口隔离，桌面随机端口重启后仍可读取。
export function getUiPreferences(): UiPreferences {
  if (typeof document === "undefined") return DEFAULTS;
  const theme = cookie("life-workbench-theme") ?? snapshot.theme;
  const sidebar = cookie("life-workbench-sidebar");
  const nextTheme = theme === "light" || theme === "dark" ? theme : "system";
  const collapsed = sidebar === undefined ? snapshot.collapsed : sidebar === "1";
  if (nextTheme !== snapshot.theme || collapsed !== snapshot.collapsed) snapshot = { theme: nextTheme, collapsed };
  return snapshot;
}

export const getServerUiPreferences = () => DEFAULTS;

function applyRoot(preferences: UiPreferences) {
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.sidebarCollapsed = String(preferences.collapsed);
}

export function subscribeUiPreferences(listener: () => void) {
  const refresh = () => { applyRoot(getUiPreferences()); listener(); };
  window.addEventListener(CHANGE_EVENT, refresh);
  window.addEventListener("focus", refresh);
  return () => {
    window.removeEventListener(CHANGE_EVENT, refresh);
    window.removeEventListener("focus", refresh);
  };
}

export function setUiPreferences(patch: Partial<UiPreferences>) {
  snapshot = { ...getUiPreferences(), ...patch };
  document.cookie = `life-workbench-theme=${snapshot.theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.cookie = `life-workbench-sidebar=${snapshot.collapsed ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
  applyRoot(snapshot);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// 固定脚本只读取白名单值，在首次绘制前应用主题和栏宽，避免偏好闪烁。
export const UI_INIT_SCRIPT = `(function(){var c=document.cookie.split('; '),v=function(k){var x=c.find(function(s){return s.indexOf(k+'=')===0});return x?x.split('=')[1]:''},t=v('life-workbench-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'system';document.documentElement.dataset.sidebarCollapsed=String(v('life-workbench-sidebar')==='1')})()`;
