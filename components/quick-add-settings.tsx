"use client";

import { useEffect, useState } from "react";

type State = { shortcut: string; registered: boolean; error: string | null };

export default function QuickAddSettings() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const bridge = window.workbench?.quickAdd;
    if (!bridge) return;
    bridge.getState().then(setState).catch(() => setError("无法读取桌面快捷键设置，请重新打开此页。"));
  }, []);

  async function change(shortcut: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { setState(await window.workbench!.quickAdd!.setShortcut(shortcut)); }
    catch { setError("设置未完成，原快捷键仍保留；请换一个组合后重试。"); }
    finally { setBusy(false); }
  }

  if (!state && !error) return null;
  return (
    <section className="card mb-4 p-5" aria-labelledby="quick-add-settings-title">
      <h2 id="quick-add-settings-title" className="text-sm font-semibold">快速记录快捷键</h2>
      <p className="mb-4 mt-2 text-sm leading-6 text-muted">应用运行时，即使窗口已最小化，也能呼出快速记录。可以更换组合，避开输入法或其他程序。</p>
      {state && <label className="block max-w-xs text-xs text-muted">桌面快捷键
        <select value={state.shortcut} onChange={(event) => { void change(event.target.value); }} disabled={busy} className="input mt-2">
          <option value="CommandOrControl+Shift+Space">Ctrl / ⌘ + Shift + 空格</option>
          <option value="CommandOrControl+Alt+N">Ctrl / ⌘ + Alt + N</option>
          <option value="Alt+Shift+N">Alt + Shift + N</option>
          <option value="">关闭桌面快捷键</option>
        </select>
      </label>}
      <p role="status" className={`mt-3 text-xs leading-5 ${error || state?.error ? "text-danger" : "text-muted"}`}>{error || state?.error || (busy ? "正在保存…" : state?.registered ? "快捷键已启用。" : "可继续通过顶栏按钮或应用内 Ctrl / ⌘ + Shift + 空格记录。")}</p>
    </section>
  );
}
