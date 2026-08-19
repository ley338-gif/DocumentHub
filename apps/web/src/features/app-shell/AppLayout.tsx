import { Outlet, useNavigate } from "react-router-dom";
import { AppShell, Button, Select } from "../../design-system";
import { useAuthStore } from "../auth/auth-store";
import styles from "./AppLayout.module.css";

// All nav items now have real destinations.
const NAV_ITEMS = [
  { label: "Dashboard", to: "/app" },
  { label: "Produkte", to: "/app/products" },
  { label: "Dokumente", to: "/app/documents" },
  { label: "Veröffentlichungen", to: "/app/publications" },
  { label: "Audit", to: "/app/audit" },
];

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const organizations = useAuthStore((s) => s.organizations);
  const currentOrganizationId = useAuthStore((s) => s.currentOrganizationId);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const currentOrg = organizations.find((o) => o.id === currentOrganizationId);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <AppShell
      navItems={NAV_ITEMS}
      topbarActions={
        <div className={styles.userMenu}>
          {organizations.length > 0 && (
            <div className={styles.orgSelect}>
              <Select
                aria-label="Organisation"
                value={currentOrganizationId ?? ""}
                onChange={(e) => switchOrganization(e.target.value)}
                options={organizations.map((o) => ({ value: o.id, label: o.name }))}
              />
            </div>
          )}
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user?.fullName}</span>
            <span className={styles.userRole}>{currentOrg?.role}</span>
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
