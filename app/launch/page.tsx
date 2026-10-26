"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Site } from "@/db/schema";
import { ChevronDown, ChevronUp, ExternalLink, FileText, FolderOpen, Plus, Rocket, Trash2, X, Zap } from "lucide-react";
import { EmptyState, PageError, PageHeader, PageLoading } from "@/components/page-header";

type GroupWithItems = { id: number; name: string; icon: string | null; sortOrder: number; items: Site[] };
type LaunchData = { groups: GroupWithItems[]; loose: Site[] };
type ItemForm = { name: string; url: string; type: "url" | "file"; groupId: number };
const EMPTY_ITEM: ItemForm = { name: "", url: "", type: "url", groupId: 0 };

function favicon(url: string) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; }
  catch { return null; }
}

async function readLaunch(signal?: AbortSignal): Promise<LaunchData> {
  const [groups, sites] = await Promise.all([
    api<GroupWithItems[]>("/api/groups", { signal }), api<Site[]>("/api/sites", { signal }),
  ]);
  return { groups, loose: sites.filter((item) => item.groupId === null) };
}

async function openItem(item: Site) {
  if (item.itemType !== "file") { window.open(item.url, "_blank", "noopener,noreferrer"); return; }
  const response = await fetch("/api/open", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: item.url }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error ?? "文件未能打开，请检查路径。");
  }
}

function ItemIcon({ item, size = 32 }: { item: Site; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (item.itemType === "file") return <span className="grid shrink-0 place-items-center rounded-lg bg-bg text-muted" style={{ width: size, height: size }}><FileText size={size * 0.55} /></span>;
  const icon = item.iconUrl ?? favicon(item.url);
  if (icon && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" width={size} height={size} className="shrink-0 rounded-lg bg-surface" onError={() => setFailed(true)} />;
  }
  return <span className="grid shrink-0 place-items-center rounded-lg bg-accent-soft font-medium text-accent" style={{ width: size, height: size, fontSize: size * 0.42 }}>{item.name.slice(0, 1)}</span>;
}

export default function LaunchPage() {
  const [data, setData] = useState<LaunchData | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const groups = data?.groups ?? [];
  const loose = data?.loose ?? [];
  const total = groups.reduce((count, group) => count + group.items.length, 0) + loose.length;
  const load = useCallback(async () => { setData(await readLaunch()); }, []);

  useEffect(() => {
    const controller = new AbortController();
    readLaunch(controller.signal).then(setData).catch(() => {
      if (!controller.signal.aborted) setError("集合读取失败，请重新加载。");
    });
    return () => controller.abort();
  }, []);

  const refresh = async () => {
    setError("");
    try { await load(); } catch { setError("集合读取失败，请重新加载。"); }
  };

  const perform = async (action: () => Promise<unknown>, failure: string) => {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try { await action(); await refresh(); return true; }
    catch { setError(failure); return false; }
    finally { setBusy(false); }
  };

  const addGroup = async () => {
    if (!groupName.trim()) return;
    const saved = await perform(() => api("/api/groups", { method: "POST", json: { name: groupName.trim(), sortOrder: groups.length } }), "集合未能创建，已保留输入，请重试。");
    if (saved) { setGroupName(""); setAddingGroup(false); }
  };

  const delGroup = (group: GroupWithItems) => {
    if (!confirm(`删除集合「${group.name}」？里面的条目会变成散件，不会被删除。`)) return;
    void perform(() => api(`/api/groups/${group.id}`, { method: "DELETE" }), "集合未能删除，请重试。");
  };

  const addItem = async () => {
    if (!itemForm.name.trim() || !itemForm.url.trim()) return;
    const saved = await perform(() => api("/api/sites", {
      method: "POST", json: { name: itemForm.name.trim(), url: itemForm.url.trim(), itemType: itemForm.type, groupId: itemForm.groupId || null, sortOrder: loose.length },
    }), "条目未能保存，已保留输入，请重试。");
    if (saved) { setItemForm(EMPTY_ITEM); setAddingItem(false); }
  };

  const delItem = (item: Site) => { void perform(() => api(`/api/sites/${item.id}`, { method: "DELETE" }), "条目未能删除，请重试。"); };
  const removeFromGroup = (item: Site) => { void perform(() => api(`/api/sites/${item.id}`, { method: "PATCH", json: { groupId: null } }), "条目未能移出集合，请重试。"); };

  const openMany = async (items: Site[]) => {
    setError(""); setNotice("");
    const results = await Promise.allSettled(items.map(openItem));
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") setError(failed.reason instanceof Error ? failed.reason.message : "部分条目未能打开，请重试。");
    else if (items.length > 1) setNotice("已发送打开请求。若网页没有出现，请检查浏览器的弹窗设置。");
  };

  const pickFile = async () => {
    try {
      const selected = await window.workbench?.pickFile();
      if (selected) setItemForm((current) => ({ ...current, url: selected, name: current.name || selected.split(/[\\/]/).pop() || "" }));
    } catch { setError("未能读取文件，请重试或直接填写文件路径。"); }
  };

  return (
    <div className="page-shell">
      <PageHeader title="开工" description="把常用网站和文件放进集合，一次打开。" meta={data && <span className="tnum">{groups.length} 个集合，共 {total} 个条目</span>}
        actions={<><button type="button" onClick={() => setAddingGroup((value) => !value)} className="btn-ghost" aria-expanded={addingGroup}><FolderOpen size={15} />新建集合</button><button type="button" onClick={() => setAddingItem((value) => !value)} className="btn-primary" aria-expanded={addingItem}><Plus size={15} />添加条目</button></>} />

      {error && <div className="mb-5"><PageError message={error} onRetry={refresh} /></div>}
      {notice && <p role="status" className="mb-5 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">{notice}</p>}

      {addingGroup && (
        <form onSubmit={(event) => { event.preventDefault(); void addGroup(); }} className="card mb-5 p-5">
          <label htmlFor="launch-group-name" className="mb-2 block text-sm font-semibold">集合名称</label>
          <div className="flex flex-col gap-3 sm:flex-row"><input id="launch-group-name" autoFocus value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="如：学习资料、日常工作" className="input min-w-0 flex-1" required />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setAddingGroup(false)} disabled={busy} className="btn-ghost">取消</button><button type="submit" disabled={busy || !groupName.trim()} className="btn-primary">创建集合</button></div></div>
        </form>
      )}

      {addingItem && (
        <form onSubmit={(event) => { event.preventDefault(); void addItem(); }} className="card mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold">添加条目</h2>
          <fieldset disabled={busy} className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="条目类型">{(["url", "file"] as const).map((type) => <button type="button" key={type} onClick={() => setItemForm((current) => ({ ...current, type }))} aria-pressed={itemForm.type === type}
              className={`rounded-lg border px-3 py-2 text-xs ${itemForm.type === type ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-bg text-muted"}`}>{type === "url" ? "网站" : "本地文件"}</button>)}</div>
            <div><label htmlFor="launch-item-name" className="mb-2 block text-xs font-medium text-muted">名称</label><input id="launch-item-name" autoFocus value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} placeholder="如：课程资料" className="input" required /></div>
            <div><label htmlFor="launch-item-url" className="mb-2 block text-xs font-medium text-muted">{itemForm.type === "url" ? "网址" : "文件绝对路径"}</label><input id="launch-item-url" value={itemForm.url} onChange={(event) => setItemForm((current) => ({ ...current, url: event.target.value }))} placeholder={itemForm.type === "url" ? "如：bilibili.com" : "如：D:\\docs\\课程资料.pdf"} className="input" required /></div>
            {itemForm.type === "file" && typeof window !== "undefined" && window.workbench?.isDesktop && <button type="button" onClick={() => { void pickFile(); }} className="btn-ghost"><FolderOpen size={14} />从电脑选择文件</button>}
            <div><label htmlFor="launch-item-group" className="mb-2 block text-xs font-medium text-muted">所属集合</label><select id="launch-item-group" value={itemForm.groupId} onChange={(event) => setItemForm((current) => ({ ...current, groupId: Number(event.target.value) }))} className="input"><option value={0}>未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
            <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setAddingItem(false)} className="btn-ghost">取消</button><button type="submit" disabled={!itemForm.name.trim() || !itemForm.url.trim()} className="btn-primary">{busy ? "正在添加…" : "添加条目"}</button></div>
          </fieldset>
        </form>
      )}

      {!data && !error ? <PageLoading rows={4} /> : data && (total > 0 || groups.length > 0) ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">常用集合</h2>{total > 1 && <button type="button" onClick={() => { void openMany([...groups.flatMap((group) => group.items), ...loose]); }} className="btn-ghost"><Zap size={14} />一键全开工</button>}</div>
          {groups.length > 0 ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {groups.map((group) => (
              <article key={group.id} className="card min-w-0 overflow-hidden">
                <div className="flex items-center gap-3 p-4 sm:p-5">
                  <button type="button" onClick={() => { void openMany(group.items); }} disabled={group.items.length === 0} className="min-w-0 flex-1 text-left">
                    <span className="mb-3 flex min-h-8 -space-x-1.5">{group.items.slice(0, 4).map((item) => <span key={item.id} className="rounded-lg ring-2 ring-surface"><ItemIcon item={item} size={30} /></span>)}{group.items.length === 0 && <span className="grid h-8 w-8 place-items-center rounded-lg bg-bg text-muted"><FolderOpen size={18} /></span>}</span>
                    <span className="block break-words text-sm font-semibold">{group.icon && <span className="mr-1.5">{group.icon}</span>}{group.name}</span>
                    <span className="mt-1 block text-xs text-muted">{group.items.length} 个条目{group.items.length > 0 ? "，点击打开集合" : "，等待添加条目"}</span>
                  </button>
                  <button type="button" onClick={() => setExpanded(expanded === group.id ? null : group.id)} aria-expanded={expanded === group.id} aria-controls={`launch-group-${group.id}`} className="btn-ghost shrink-0">管理{expanded === group.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
                </div>
                {expanded === group.id && <div id={`launch-group-${group.id}`} className="border-t border-line bg-bg/50 p-3">
                  {group.items.length === 0 && <p className="px-2 py-3 text-xs text-muted">添加条目时选择这个集合。</p>}
                  {group.items.map((item) => <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 hover:bg-bg"><ItemIcon item={item} size={22} /><button type="button" onClick={() => { void openMany([item]); }} className="min-w-0 flex-1 break-words text-left text-sm hover:text-accent">{item.name}</button><button type="button" disabled={busy} onClick={() => removeFromGroup(item)} title="移出集合" aria-label={`移出集合 ${item.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"><X size={14} /></button><button type="button" disabled={busy} onClick={() => delItem(item)} title="删除条目" aria-label={`删除条目 ${item.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger"><Trash2 size={14} /></button></div>)}
                  <div className="mt-2 flex justify-end border-t border-line pt-2"><button type="button" disabled={busy} onClick={() => delGroup(group)} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-xs text-muted hover:text-danger"><Trash2 size={13} />删除集合</button></div>
                </div>}
              </article>
            ))}
          </div> : <p className="mb-5 text-sm text-muted">还没有集合，可以先把常用条目分组。</p>}

          {loose.length > 0 && <section className="mt-7" aria-labelledby="loose-items-title"><h2 id="loose-items-title" className="mb-4 text-sm font-semibold">未分组 <span className="ml-1 text-xs font-normal text-muted tnum">{loose.length}</span></h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2">{loose.map((item) => <article key={item.id} className="card flex min-w-0 items-center gap-3 p-4"><button type="button" onClick={() => { void openMany([item]); }} className="flex min-w-0 flex-1 items-center gap-3 text-left"><ItemIcon item={item} /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{item.name}</span><span className="mt-1 block truncate text-xs text-muted">{item.itemType === "file" ? "本地文件" : item.url}</span></span><ExternalLink size={14} className="shrink-0 text-muted" /></button><button type="button" disabled={busy} onClick={() => delItem(item)} aria-label={`删除条目 ${item.name}`} title="删除条目" className="grid min-h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-bg hover:text-danger"><Trash2 size={15} /></button></article>)}</div></section>}
        </>
      ) : data && !addingGroup && !addingItem ? <EmptyState title="还没有开工条目" description="添加常用网站或本地文件，再把相关条目放进集合。" icon={<Rocket size={24} />} /> : null}
    </div>
  );
}
