"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getServerUiPreferences, getUiPreferences, setUiPreferences, subscribeUiPreferences } from "@/lib/ui-preferences";
import Sidebar from "./sidebar";
import Topbar from "./topbar";

export default function AppShell({ children }: { children: ReactNode }) {
  const preferences = useSyncExternalStore(subscribeUiPreferences, getUiPreferences, getServerUiPreferences);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const navigationTrigger = useRef<HTMLElement | null>(null);
  const pathname = usePathname();

  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => { if (event.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = navigationTrigger.current;
    const navigation = document.getElementById("app-navigation");
    const focusable = () => Array.from(navigation?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), select") ?? [])
      .filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [mobileOpen]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">跳到页面内容</a>
      {mobileOpen && <button type="button" className="nav-scrim" aria-label="关闭导航" tabIndex={-1} onClick={() => setMobileOpen(false)} />}
      <Sidebar collapsed={preferences.collapsed} onToggle={() => setUiPreferences({ collapsed: !preferences.collapsed })} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      <div className="app-workspace" inert={mobileOpen}>
        <Topbar theme={preferences.theme} onThemeChange={(theme) => setUiPreferences({ theme })} navigationOpen={mobileOpen} onOpenNavigation={() => {
          navigationTrigger.current = document.activeElement as HTMLElement | null;
          setMobileOpen(true);
        }} />
        <main id="main-content" ref={mainRef} tabIndex={-1} className="app-main">{children}</main>
      </div>
    </div>
  );
}
