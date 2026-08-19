import type { ReactNode } from "react";
import { Sidebar, type SidebarNavItem } from "./Sidebar";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  navItems: SidebarNavItem[];
  topbarActions?: ReactNode;
  children: ReactNode;
  /** Passed straight through to Sidebar — see its docs. */
  sidebarSubtitle?: string;
}

/** Top bar + sidebar layout shell for the authenticated tree. */
export function AppShell({ navItems, topbarActions, children, sidebarSubtitle }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <Sidebar items={navItems} subtitle={sidebarSubtitle} />
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div />
          <div className={styles.topbarActions}>{topbarActions}</div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
