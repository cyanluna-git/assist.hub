"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, FileText, GraduationCap, Inbox, LayoutDashboard } from "lucide-react";
import styles from "./layout.module.css";

type IconKey = "dashboard" | "bulletin" | "materials" | "schedule" | "courses";

export type NavItem = {
  href: string;
  label: string;
  icon: IconKey;
  disabled?: boolean;
};

interface SidebarNavProps {
  items: NavItem[];
  collapsed?: boolean;
}

export default function SidebarNav({ items, collapsed = false }: SidebarNavProps) {
  const pathname = usePathname();
  const iconMap = {
    dashboard: LayoutDashboard,
    bulletin: Inbox,
    materials: FileText,
    schedule: Calendar,
    courses: GraduationCap,
  };

  return (
    <nav className={styles.nav} aria-label="Primary navigation">
      <ul className={styles.navList}>
        {items.map((item) => {
          const isActive = !item.disabled && (pathname === item.href || pathname.startsWith(`${item.href}/`));
          const Icon = iconMap[item.icon];

          return (
            <li key={item.href}>
              {item.disabled ? (
                <span className={`${styles.navLink} ${collapsed ? styles.navLinkCollapsed : ""}`} aria-disabled="true">
                  <span className={styles.navLeft}>
                    <Icon size={18} />
                    <span className={styles.navLabel}>{item.label}</span>
                  </span>
                  <span className={styles.badge}>Soon</span>
                </span>
              ) : (
                <Link
                  href={item.href}
                  className={`${styles.navLink} ${isActive ? styles.navActive : ""} ${collapsed ? styles.navLinkCollapsed : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={styles.navLeft}>
                    <Icon size={18} />
                    <span className={styles.navLabel}>{item.label}</span>
                  </span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
