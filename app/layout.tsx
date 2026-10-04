import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";

export const metadata: Metadata = {
  title: "人生工作台",
  description: "本地优先的极简个人工作台",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full overflow-hidden">
        <div className="flex h-full">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
