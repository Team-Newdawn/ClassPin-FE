"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Grid2X2, LayoutDashboard, MoreHorizontal, Play } from "@/components/icons";
import { PinLogo } from "@/components/pin-logo";
import { useSessions } from "@/components/session-store";

export function AdminSidebar() {
  const pathname = usePathname();
  const { sessions } = useSessions();
  const liveSession = sessions.find((session) => session.status === "live") ?? sessions[0];
  const items = [
    { href: "/admin/dashboard", label: "대시보드", icon: LayoutDashboard, active: pathname.startsWith("/admin/dashboard") },
    { href: liveSession ? `/admin/session/${liveSession.id}` : "/", label: "라이브 세션", icon: Play, active: pathname.startsWith("/admin/session") },
    { href: "/admin/materials", label: "강의 자료", icon: Grid2X2, active: pathname.startsWith("/admin/materials") },
    { href: "/admin/insights", label: "인사이트", icon: BarChart3, active: pathname.startsWith("/admin/insights") }
  ];

  return (
    <aside className="sidebar">
      {/* PinLogo 가 이미 홈으로 가는 Link 다. 한 번 더 감싸면 a 안의 a 가 된다. */}
      <div className="sidebar-logo"><PinLogo /></div>
      <nav>
        {items.map(({ href, label, icon: Icon, active }) => (
          <Link key={label} href={href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon />{label}</Link>
        ))}
      </nav>
      <div className="sidebar-bottom"><span className="avatar">MP</span><span><b>민찬 강사</b><small>개인 워크스페이스</small></span><MoreHorizontal /></div>
    </aside>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell"><AdminSidebar /><main className="admin-main">{children}</main></div>;
}

export function AdminTopbar({ title, caption, actions }: { title: string; caption?: string; actions?: React.ReactNode }) {
  return (
    <header className="topbar">
      <div className="session-identity"><span><b>{title}</b>{caption && <small>{caption}</small>}</span></div>
      {actions && <div className="top-actions">{actions}</div>}
    </header>
  );
}
