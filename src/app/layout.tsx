import type { Metadata } from "next";
import {
  Search,
  Settings,
} from "lucide-react";
import SidebarNav from "./SidebarNav";
import type { NavItem } from "./SidebarNav";
import styles from "./layout.module.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "aSSIST MBA Hub",
  description: "Personal Second Brain for MBA",
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/bulletin", label: "Bulletin", icon: "bulletin" },
  { href: "/materials", label: "Materials", icon: "materials" },
  { href: "/schedule", label: "Schedule", icon: "schedule" },
  { href: "/courses", label: "Courses", icon: "courses", disabled: true },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <div className="app-shell">
          <aside className={styles.sidebar}>
            <section className={styles.brand}>
              <p className={styles.brandTitle}>aSSIST Hub</p>
              <p className={styles.brandSub}>MBA Personal Second Brain</p>
            </section>

            <section className={styles.userCard}>
              <div className={styles.userTop}>
                <span className={styles.avatar}>P</span>
                <span className={styles.userName}>박근윤</span>
              </div>
              <p className={styles.userHint}>이번 주 학습 흐름을 점검하세요.</p>
              <button type="button" className={styles.searchTrigger} aria-label="Open command palette">
                <span className={styles.searchLeft}>
                  <Search size={14} />
                  <span>Quick Search</span>
                </span>
                <span className={styles.kbd}>⌘K</span>
              </button>
            </section>

            <SidebarNav items={NAV_ITEMS} />

            <footer className={styles.footer}>
              <span className={styles.navLink} aria-disabled="true">
                <span className={styles.navLeft}>
                  <Settings size={18} />
                  <span className={styles.navLabel}>Settings</span>
                </span>
                <span className={styles.badge}>Soon</span>
              </span>
            </footer>
          </aside>

          <main className="main-shell">
            <div className="page-container">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
