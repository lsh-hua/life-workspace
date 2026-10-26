import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/app-shell";
import { UI_INIT_SCRIPT } from "@/lib/ui-preferences";

export const metadata: Metadata = {
  title: "人生工作台",
  description: "本地优先的极简个人工作台",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: UI_INIT_SCRIPT }} /></head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
