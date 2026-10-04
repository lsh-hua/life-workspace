"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Site } from "@/db/schema";
import {
  Plus,
  Rocket,
  Trash2,
  Zap,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  FileText,
  X,
} from "lucide-react";

type GroupWithItems = {
  id: number;
  name: string;
  icon: string | null;
  sortOrder: number;
  items: Site[];
};

function favicon(url: string) {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return null;
  }
}

/** 打开一个条目：网址走新标签，文件走本地打开接口 */
async function openItem(item: Site) {
  if (item.itemType === "file") {
    const res = await fetch("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: item.url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "打开失败");
    }
    return;
  }
  window.open(item.url, "_blank");
}

function ItemIcon({ item, size = 32 }: { item: Site; size?: number }) {
  const [err, setErr] = useState(false);
  if (item.itemType === "file") {
    return (
      <span
        className="flex items-center justify-center rounded-lg bg-bg text-muted"
        style={{ width: size, height: size }}
      >
        <FileText size={size * 0.55} />
      </span>
    );
  }
  const icon = item.iconUrl ?? favicon(item.url);
  if (icon && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        width={size}
        height={size}
        className="rounded-lg"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-lg bg-ink text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {item.name.slice(0, 1)}
    </span>
  );
}

export default function LaunchPage() {
  const [groups, setGroups] = useState<GroupWithItems[]>([]);
  const [loose, setLoose] = useState<Site[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState({ name: "", url: "", type: "url" as "url" | "file", groupId: 0 });

  const load = useCallback(async () => {
    const [gs, ss] = await Promise.all([
      api<GroupWithItems[]>("/api/groups"),
      api<Site[]>("/api/sites"),
    ]);
    setGroups(gs);
    setLoose(ss.filter((s) => s.groupId === null));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const addGroup = async () => {
    if (!groupName.trim()) return;
    await api("/api/groups", { method: "POST", json: { name: groupName.trim(), sortOrder: groups.length } });
    setGroupName("");
    setAddingGroup(false);
    load();
  };

  const delGroup = async (g: GroupWithItems) => {
    if (!confirm(`删除集合「${g.name}」？里面的条目会变成散件，不会被删除。`)) return;
    await api(`/api/groups/${g.id}`, { method: "DELETE" });
    load();
  };

  const addItem = async () => {
    if (!itemForm.name.trim() || !itemForm.url.trim()) return;
    await api("/api/sites", {
      method: "POST",
      json: {
        name: itemForm.name.trim(),
        url: itemForm.url.trim(),
        itemType: itemForm.type,
        groupId: itemForm.groupId || null,
        sortOrder: loose.length,
      },
    });
    setItemForm({ name: "", url: "", type: "url", groupId: 0 });
    setAddingItem(false);
    load();
  };

  const delItem = async (s: Site) => {
    await api(`/api/sites/${s.id}`, { method: "DELETE" });
    load();
  };

  const removeFromGroup = async (s: Site) => {
    await api(`/api/sites/${s.id}`, { method: "PATCH", json: { groupId: null } });
    load();
  };

  const openGroup = (g: GroupWithItems) => {
    for (const item of g.items) openItem(item);
  };

  const openAll = () => {
    for (const g of groups) for (const item of g.items) openItem(item);
    for (const s of loose) openItem(s);
  };

  const total = groups.reduce((n, g) => n + g.items.length, 0) + loose.length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">开工</h1>
          <p className="mt-1 text-sm text-muted">点一下集合，一批站点和文件同时打开</p>
        </div>
        {total > 1 && (
          <button
            onClick={openAll}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs text-white hover:opacity-85"
          >
            <Zap size={13} /> 一键全开工
          </button>
        )}
      </header>

      {/* 集合区 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {groups.map((g) => (
          <div key={g.id} className="group relative">
            <button
              onClick={() => openGroup(g)}
              className="card card-hover flex w-full flex-col items-start gap-3 p-4 text-left"
            >
              {/* 图标堆叠预览 */}
              <div className="flex -space-x-2">
                {g.items.slice(0, 4).map((it) => (
                  <span key={it.id} className="rounded-lg ring-2 ring-surface">
                    <ItemIcon item={it} size={26} />
                  </span>
                ))}
                {g.items.length === 0 && (
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-bg text-faint">
                    <FolderOpen size={14} />
                  </span>
                )}
              </div>
              <div className="w-full">
                <div className="truncate text-sm font-medium">
                  {g.icon && <span className="mr-1">{g.icon}</span>}
                  {g.name}
                </div>
                <div className="mt-0.5 text-[11px] text-faint">{g.items.length} 个条目 · 点击全部打开</div>
              </div>
            </button>
            <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => setExpanded(expanded === g.id ? null : g.id)}
                title="管理集合"
                className="rounded-md bg-surface p-1 text-faint hover:text-ink"
              >
                {expanded === g.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button
                onClick={() => delGroup(g)}
                title="删除集合"
                className="rounded-md bg-surface p-1 text-faint hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </div>

            {/* 展开：集合内条目管理 */}
            {expanded === g.id && (
              <div className="anim-fade-up mt-1.5 space-y-1 rounded-xl border border-line bg-surface p-2">
                {g.items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-bg">
                    <ItemIcon item={it} size={18} />
                    <button onClick={() => openItem(it)} className="min-w-0 flex-1 truncate text-left hover:underline">
                      {it.name}
                    </button>
                    <button onClick={() => removeFromGroup(it)} title="移出集合" className="text-faint hover:text-ink">
                      <X size={12} />
                    </button>
                    <button onClick={() => delItem(it)} title="删除" className="text-faint hover:text-danger">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {g.items.length === 0 && <p className="px-2 py-1 text-[11px] text-faint">空集合，添加条目时选进来</p>}
              </div>
            )}
          </div>
        ))}

        {/* 新建集合 */}
        {addingGroup ? (
          <div className="card border-ink/30 p-4">
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGroup()}
              placeholder="集合名，如：娱乐"
              className="mb-2 input"
            />
            <div className="flex justify-end gap-1.5">
              <button onClick={() => setAddingGroup(false)} className="rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-bg">
                取消
              </button>
              <button onClick={addGroup} className="btn-primary">
                创建
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingGroup(true)}
            className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-faint transition-colors hover:border-faint hover:text-muted"
          >
            <Plus size={18} />
            <span className="text-xs">新建集合</span>
          </button>
        )}
      </div>

      {/* 散件区 */}
      {loose.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-medium text-faint">未分组</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {loose.map((s) => (
              <div key={s.id} className="group relative">
                <button
                  onClick={() => openItem(s)}
                  className="card card-hover flex w-full flex-col items-center gap-2.5 px-4 py-5"
                >
                  <ItemIcon item={s} size={34} />
                  <span className="max-w-full truncate text-xs">{s.name}</span>
                </button>
                <button
                  onClick={() => delItem(s)}
                  title="删除"
                  className="absolute right-2 top-2 rounded-md p-1 text-faint opacity-0 transition-opacity hover:bg-bg hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 添加条目 */}
      <div className="mt-8">
        {addingItem ? (
          <div className="card border-ink/30 p-4">
            <div className="mb-2 flex gap-1.5">
              {(["url", "file"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setItemForm((v) => ({ ...v, type: t }))}
                  className={`rounded-lg px-3 py-1 text-xs ${itemForm.type === t ? "bg-ink text-white" : "bg-bg text-muted"}`}
                >
                  {t === "url" ? "网站" : "本地文件"}
                </button>
              ))}
            </div>
            <input
              autoFocus
              value={itemForm.name}
              onChange={(e) => setItemForm((v) => ({ ...v, name: e.target.value }))}
              placeholder="名称，如：B站 / 产品手册"
              className="mb-2 input"
            />
            <input
              value={itemForm.url}
              onChange={(e) => setItemForm((v) => ({ ...v, url: e.target.value }))}
              placeholder={
                itemForm.type === "url"
                  ? "网址，如：bilibili.com"
                  : "文件绝对路径，如：D:\\docs\\手册.pdf"
              }
              className="mb-2 input"
            />
            {itemForm.type === "file" &&
              typeof window !== "undefined" &&
              window.workbench?.isDesktop && (
                <button
                  onClick={async () => {
                    const p = await window.workbench!.pickFile();
                    if (p) {
                      setItemForm((v) => ({
                        ...v,
                        url: p,
                        name: v.name || p.split(/[\\/]/).pop() || v.name,
                      }));
                    }
                  }}
                  className="mb-2 flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted hover:bg-bg"
                >
                  <FolderOpen size={12} /> 从电脑选择文件…
                </button>
              )}
            <select
              value={itemForm.groupId}
              onChange={(e) => setItemForm((v) => ({ ...v, groupId: Number(e.target.value) }))}
              className="mb-3 h-8 w-full rounded-lg border border-line bg-bg px-2 text-xs text-muted outline-none"
            >
              <option value={0}>不放入集合（散件）</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  放入「{g.name}」
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-1.5">
              <button onClick={() => setAddingItem(false)} className="rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-bg">
                取消
              </button>
              <button onClick={addItem} className="btn-primary">
                添加
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingItem(true)}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-faint hover:border-faint hover:text-muted"
          >
            <Plus size={13} /> 添加条目（网站 / 本地文件）
          </button>
        )}
      </div>

      {total === 0 && !addingGroup && !addingItem && (
        <div className="mt-10 rounded-xl border border-dashed border-line py-14 text-center">
          <Rocket size={20} className="mx-auto mb-2 text-faint" />
          <p className="text-sm text-faint">建一个「娱乐」集合，把 B站、抖音、快手放进去试试</p>
        </div>
      )}
    </div>
  );
}
