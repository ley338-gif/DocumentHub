import { PageHeader } from "../../design-system";
import { useAuthStore } from "../auth/auth-store";

// Placeholder only — the real dashboard (KPI tiles, charts, recent
// activity) is a later phase per the brief. This exists to prove the
// authenticated shell + login flow work end-to-end.
export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Willkommen zurück${user ? `, ${user.fullName}` : ""}.`}
      />
      <p style={{ color: "var(--color-text-secondary)" }}>
        Diese Ansicht ist ein Platzhalter. Produkte, Dokumente, Veröffentlichungen, Anwendbarkeit,
        CSV-Import und Audit-Log folgen in späteren Phasen.
      </p>
    </>
  );
}
