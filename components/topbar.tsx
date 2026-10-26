"use client";

import { Menu, Monitor, Moon, Search, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { pageLabel } from "@/lib/navigation";
import type { ThemePreference } from "@/lib/ui-preferences";
import SearchDialog from "./search-dialog";

export default function Topbar({ theme, onThemeChange, onOpenNavigation, navigationOpen }: {
  theme: ThemePreference; onThemeChange: (theme: ThemePreference) => void; onOpenNavigation: () => void; navigationOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeSearch = useCallback(() => setOpen(false), []);
  const ThemeIcon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="app-topbar">
      <button type="button" className="icon-button md:hidden" onClick={onOpenNavigation} aria-controls="app-navigation" aria-expanded={navigationOpen} aria-label="打开导航"><Menu size={19} /></button>
      <p className="hidden min-w-24 text-xs text-muted md:block">工作台 <span className="mx-2 text-line">/</span> <span className="text-ink">{pageLabel(pathname)}</span></p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="topbar-search"
        aria-label="搜索任务、灵感、复盘、日程"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search size={15} />
        <span className="flex-1 truncate text-left"><span className="hidden sm:inline">搜索任务、灵感、复盘、日程</span><span className="sm:hidden">搜索工作台</span></span>
        <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-muted sm:block">
          Ctrl K
        </kbd>
      </button>
      <label className="theme-picker">
        <ThemeIcon size={15} aria-hidden="true" />
        <span className="sr-only">界面主题</span>
        <select value={theme} onChange={(event) => onThemeChange(event.target.value as ThemePreference)} aria-label="界面主题">
          <option value="system">跟随系统</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>
      </label>
      <SearchDialog open={open} onClose={closeSearch} />
    </header>
  );
}
