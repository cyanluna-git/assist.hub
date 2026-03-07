"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import type { GlobalSearchItem } from "@/lib/search";
import type { WorkspaceProfileView } from "@/lib/profile";
import ContinueReadingPanel from "./ContinueReadingPanel";
import GlobalSearch from "./GlobalSearch";
import SidebarNav, { type NavItem } from "./SidebarNav";
import styles from "./layout.module.css";

type AppShellProps = {
  children: React.ReactNode;
  navItems: NavItem[];
  searchItems: GlobalSearchItem[];
  profile: WorkspaceProfileView;
};

const STORAGE_KEY = "assist-hub-sidebar-collapsed";

export default function AppShell({ children, navItems, searchItems, profile }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "true") {
      const frame = window.requestAnimationFrame(() => {
        setCollapsed(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
  }, [collapsed]);

  const shellStyle = {
    "--sidebar-width": collapsed ? "88px" : "272px",
  } as CSSProperties;

  return (
    <div className="app-shell" style={shellStyle}>
      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}>
        <div className={styles.sidebarTop}>
          <section className={styles.brand}>
            <p className={styles.brandTitle}>aSSIST Hub</p>
            <p className={styles.brandSub}>MBA Personal Second Brain</p>
          </section>

          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <section className={styles.userCard}>
          <div className={styles.userTop}>
            <span className={styles.avatar}>{profile.avatarLabel}</span>
            <span className={styles.userName}>{profile.displayName}</span>
          </div>
          <p className={styles.userHint}>이번 주 학습 흐름을 점검하세요.</p>
          <GlobalSearch items={searchItems} compact={collapsed} />
        </section>

        <ContinueReadingPanel collapsed={collapsed} />

        <SidebarNav items={navItems} collapsed={collapsed} />

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

      <main className={`main-shell ${collapsed ? styles.mainExpanded : ""}`}>
        <div className={`page-container ${collapsed ? styles.pageContainerExpanded : ""}`}>{children}</div>
      </main>
    </div>
  );
}
