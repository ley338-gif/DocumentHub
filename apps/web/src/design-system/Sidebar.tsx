import { NavLink } from "react-router-dom";
import styles from "./Sidebar.module.css";

export interface SidebarNavItem {
  label: string;
  to: string;
}

export interface SidebarProps {
  items: SidebarNavItem[];
  /** Shown under the brand — e.g. "Platform Administration" for the
   * platform operator shell, so that context is never visually ambiguous
   * with a tenant workspace (see docs/platform-administration.md "Frontend
   * context separation"). Omitted entirely inside a tenant workspace. */
  subtitle?: string;
}

// Real nav destinations (products list, document detail, publications,
// audit UI, ...) arrive in later phases. For this run the links exist
// structurally but most targets are not yet built.
export function Sidebar({ items, subtitle }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>DH</span>
        <span>
          Document Hub
          {subtitle && <span className={styles.brandSubtitle}>{subtitle}</span>}
        </span>
      </div>
      <nav className={styles.nav}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => [styles.navItem, isActive ? styles.navItemActive : ""].join(" ")}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
