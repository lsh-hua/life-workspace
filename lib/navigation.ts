import { CalendarDays, CalendarRange, CheckSquare, GraduationCap, LayoutGrid, Lightbulb, PenLine, Rocket, Target } from "lucide-react";

export const NAV_ITEMS = [
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

export function pageLabel(pathname: string) {
  if (pathname === "/settings") return "数据与备份";
  return NAV_ITEMS.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))?.label ?? "人生工作台";
}
