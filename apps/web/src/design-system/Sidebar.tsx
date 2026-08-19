import { NavLink } from "react-router-dom";
import styles from "./Sidebar.module.css";

export interface SidebarNavItem {
  label: string;
  to: string;
}

export interface SidebarProps {
  items: SidebarNavItem[];
}

// Real nav destinations (products list, document detail, publications,
// audit UI, ...) arrive in later phases. For this run the links exist
// structurally but most targets are not yet built.
export function Sidebar({ items }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>DH</span>
        Document Hub
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
