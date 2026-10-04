"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  CheckSquare,
  CalendarDays,
  CalendarRange,
  PenLine,
  Lightbulb,
  Rocket,
  Target,
  GraduationCap,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useEffect, useState } from "react";
import Pomodoro from "./pomodoro";

const NAV = [
  { href: "/", label: "总览", icon: LayoutGrid },
  { href: "/today", label: "今日待办", icon: CheckSquare },
  { href: "/week", label: "本周清单", icon: CalendarRange },
  { href: "/calendar", label: "日历", icon: CalendarDays },
  { href: "/schedule", label: "课程表", icon: GraduationCap },
  { href: "/habits", label: "习惯打卡", icon: Target },
  { href: "/review", label: "复盘", icon: PenLine },
  { href: "/inspiration", label: "灵感", icon: Lightbulb },
  { href: "/launch", label: "开工", icon: Rocket },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex h-full flex-col border-r border-line bg-surface transition-all duration-200 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-ink text-[11px] font-semibold text-white">
              工
            </span>
            <span className="text-[15px] font-semibold tracking-tight">人生工作台</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-ink"
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
                active
                  ? "bg-ink text-white font-medium shadow-sm"
                  : "text-muted hover:bg-bg hover:text-ink active:scale-[0.98]"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* 番茄钟（侧边栏内嵌） */}
      <Pomodoro collapsed={collapsed} onExpand={() => setCollapsed(false)} />

      {/* 桌面版设置：开机自启 */}
      {!collapsed && <AutoLaunchToggle />}

      {!collapsed && (
        <div className="px-5 pb-5 text-[11px] text-faint">本地优先 · 数据不上云</div>
      )}
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
    };
  }
}

function AutoLaunchToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const isDesktop = typeof window !== "undefined" && !!window.workbench?.isDesktop;

  useEffect(() => {
    if (isDesktop) window.workbench!.getAutoLaunch().then(setEnabled);
  }, [isDesktop]);

  if (!isDesktop || enabled === null) return null;

  return (
    <div className="mx-4 mb-3 flex items-center justify-between rounded-lg border border-line px-3 py-2">
      <span className="text-xs text-muted">开机自启动</span>
      <button
        onClick={async () => setEnabled(await window.workbench!.setAutoLaunch(!enabled))}
        className={`h-4.5 w-8 rounded-full p-0.5 transition-colors ${enabled ? "bg-ink" : "bg-line"}`}
        style={{ height: 18 }}
      >
        <span
          className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-3.5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
