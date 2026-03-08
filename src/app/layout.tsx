import type { Metadata } from "next";
import { fetchWorkspaceProfile } from "@/lib/profile";
import { fetchGlobalSearchItems } from "@/lib/search";
import AppShell from "./AppShell";
import type { NavItem } from "./SidebarNav";
import "./globals.css";

export const dynamic = "force-dynamic";

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
  const [searchItems, profile] = await Promise.all([fetchGlobalSearchItems(), fetchWorkspaceProfile()]);

  return (
    <html lang="ko">
      <body>
        <AppShell navItems={NAV_ITEMS} searchItems={searchItems} profile={profile}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
