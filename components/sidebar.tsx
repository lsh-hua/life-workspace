"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, ShieldCheck, X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { NAV_ITEMS } from "@/lib/navigation";
import Pomodoro from "./pomodoro";

export default function Sidebar({ collapsed, onToggle, mobileOpen, onNavigate }: {
  collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onNavigate: () => void;
}) {
  const pathname = usePathname();
  const compact = collapsed && !mobileOpen;

  return (
    <aside
      id="app-navigation"
      aria-label="主导航"
      role={mobileOpen ? "dialog" : undefined}
      aria-modal={mobileOpen ? true : undefined}
      className={`app-sidebar ${mobileOpen ? "mobile-open" : ""}`}
    >
      <div className="sidebar-brand">
        <Link href="/" aria-label="人生工作台总览" onClick={onNavigate} className="flex min-w-0 items-center gap-2.5">
          <span className="sidebar-mark">工</span>
          <span className="sidebar-label sidebar-brand-text"><span>人生工作台</span><small>本地工作空间</small></span>
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className="sidebar-toggle hidden md:grid"
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <button type="button" onClick={onNavigate} className="sidebar-toggle md:hidden" aria-label="关闭导航"><X size={18} /></button>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 px-3 pb-5 pt-1" aria-label="页面">
        {NAV_ITEMS.map(({ href, label, icon: Icon }, index) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Fragment key={href}>
              {(index === 0 || index === 6) && <p className="sidebar-label sidebar-group-label">{index === 0 ? "计划与安排" : "记录与专注"}</p>}
              <Link
                href={href}
                title={label}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={`nav-link ${active ? "is-active" : ""}`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="sidebar-label">{label}</span>
              </Link>
            </Fragment>
          );
        })}
      </nav>

      {/* 番茄钟（侧边栏内嵌） */}
      <Pomodoro collapsed={compact} onExpand={onToggle} />

      {/* 桌面版设置：开机自启 */}
      {!compact && <div className="sidebar-extra"><AutoLaunchToggle /></div>}

      <Link
        href="/settings"
        title="数据与备份"
        aria-label="数据与备份"
        aria-current={pathname === "/settings" ? "page" : undefined}
        onClick={onNavigate}
        className={`nav-link mx-3 mb-3 ${pathname === "/settings" ? "is-active" : ""}`}
      >
        <ShieldCheck size={17} strokeWidth={1.8} />
        <span className="sidebar-label">数据与备份</span>
      </Link>

      <div className="sidebar-label px-5 pb-5 text-[11px] text-muted">本地优先 · 数据不上云</div>
    </aside>
  );
}

declare global {
  interface Window {
    workbench?: {
      isDesktop: boolean;
      pickFile: () => Promise<string | null>;
      openPath: (p: string) => Promise<string>;
      getAutoLaunch: () => Promise<boolean>;
      setAutoLaunch: (v: boolean) => Promise<boolean>;
      backups?: {
        getRestoreInfo: () => Promise<{ supported: boolean; last: { retainedDirectory: string; restoredAt: string } | null }>;
        restore: (name: string) => Promise<{ cancelled: boolean; error?: boolean }>;
      };
      quickAdd?: {
        getState: () => Promise<{ shortcut: string; registered: boolean; error: string | null }>;
        setShortcut: (shortcut: string) => Promise<{ shortcut: string; registered: boolean; error: string | null }>;
        onOpen: (callback: () => void) => () => void;
        drafts: {
          getItem: () => string | null;
          setItem: (value: string) => void;
          removeItem: () => void;
        };
      };
      reviewDrafts?: {
        getItem: (key: string) => string | null;
        setItem: (key: string, value: string) => void;
        removeItem: (key: string) => void;
      };
    };
  }
}

function AutoLaunchToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const isDesktop = typeof window !== "undefined" && !!window.workbench?.isDesktop;

  useEffect(() => {
    if (isDesktop) window.workbench!.getAutoLaunch().then(setEnabled).catch(() => setEnabled(null));
  }, [isDesktop]);

  if (!isDesktop || enabled === null) return null;

  return (
    <div className="mx-4 mb-3 flex items-center justify-between rounded-lg border border-line px-3 py-2">
      <span className="text-xs text-muted">开机自启动</span>
      <button
        type="button"
        role="switch"
        aria-label="开机自启动"
        aria-checked={enabled}
        onClick={async () => setEnabled(await window.workbench!.setAutoLaunch(!enabled))}
        className={`h-4.5 w-8 rounded-full p-0.5 transition-colors ${enabled ? "bg-ink" : "bg-line"}`}
        style={{ height: 18 }}
      >
        <span
          className={`block h-3.5 w-3.5 rounded-full bg-surface transition-transform ${
            enabled ? "translate-x-3.5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
