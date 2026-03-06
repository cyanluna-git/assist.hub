import type { Metadata } from "next";
import {
  Settings,
} from "lucide-react";
import { fetchGlobalSearchItems } from "@/lib/search";
import GlobalSearch from "./GlobalSearch";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const searchItems = await fetchGlobalSearchItems();

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
              <GlobalSearch items={searchItems} />
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
