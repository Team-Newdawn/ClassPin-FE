"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, LogOut, MoreHorizontal } from "@/components/icons";
import { useAuth } from "@/components/auth-context";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { PinLogo } from "@/components/pin-logo";

export function PinAdminSidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { configured, profile, signOut } = useAuth();
  const name = profile?.displayName ?? profile?.email ?? t("nav.myWorkspace");
  const items = [
    {
      href: "/pin/admin",
      label: t("pin.nav.campaigns"),
      icon: Grid2X2,
      active: pathname === "/pin/admin" || pathname.startsWith("/pin/admin/")
    }
  ];

  return (
    <aside className="sidebar pin-admin-sidebar">
      <div className="sidebar-logo"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /></div>
      <nav>
        {items.map(({ href, label, icon: Icon, active }) => (
          <Link key={label} href={href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon />{label}</Link>
        ))}
      </nav>
      <LanguageSwitcher className="sidebar-language" />
      <div className="sidebar-bottom">
        <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>
        <span><b>{name}</b><small>{profile?.email ?? t("nav.personalWorkspace")}</small></span>
        {configured
          ? <button className="logout-btn" title={t("common.logout")} aria-label={t("common.logout")} onClick={() => void signOut().catch((error) => console.error("Sign out failed", error))}><LogOut /></button>
          : <MoreHorizontal />}
      </div>
    </aside>
  );
}

export function PinAdminShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell"><PinAdminSidebar /><main className="admin-main">{children}</main></div>;
}
