import { Outlet, useNavigate } from "react-router-dom";
import { AppShell, Button } from "../../design-system";
import { useAuthStore } from "../auth/auth-store";
import styles from "./PlatformLayout.module.css";

const NAV_ITEMS = [
  { label: "Übersicht", to: "/platform" },
  { label: "Tenants", to: "/platform/tenants" },
  { label: "Benutzer", to: "/platform/users" },
  { label: "Audit", to: "/platform/audit" },
  { label: "System", to: "/platform/system" },
];

/** Own shell, deliberately never rendered inside a tenant Organization
 * context — no org switcher, no tenant nav. See docs/platform-administration.md
 * "Frontend context separation": a platform admin must never be able to
 * mistake this for editing inside a customer's workspace. */
export function PlatformLayout() {
  const user = useAuthStore((s) => s.user);
  const organizations = useAuthStore((s) => s.organizations);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <AppShell
      navItems={NAV_ITEMS}
      sidebarSubtitle="Platform Administration"
      topbarActions={
        <div className={styles.userMenu}>
          {organizations.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/app")}>
              Zu meinen Organisationen
            </Button>
          )}
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user?.fullName}</span>
            <span className={styles.userRole}>Platform Admin</span>
          </div>
          <Button variant="secondary" size="sm" onClick={handleLogout}>
            Abmelden
          </Button>
        </div>
      }
    >
      <Outlet />
    </AppShell>
  );
}
