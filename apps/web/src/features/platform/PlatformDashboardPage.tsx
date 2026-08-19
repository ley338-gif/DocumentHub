import { useEffect, useState } from "react";
import { ErrorState, LoadingState, PageHeader, StatTile } from "../../design-system";
import type { PlatformDashboardSummaryDto } from "../../lib/api-types";
import { formatFileSize } from "../../lib/format";
import { fetchDashboardSummary } from "./api";

export function PlatformDashboardPage() {
  const [summary, setSummary] = useState<PlatformDashboardSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Übersicht" subtitle="Kennzahlen über alle Tenants hinweg." />

      {loading && <LoadingState label="Kennzahlen werden geladen…" />}
      {error != null && <ErrorState error={error} fallback="Kennzahlen konnten nicht geladen werden." />}
      {!loading && !error && summary && (
        <>
          <h3 style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: "0 0 0.75rem" }}>
            Tenants
          </h3>
          <div className="stat-grid" style={gridStyle}>
            <StatTile label="Gesamt" value={summary.tenants.total} icon="🏢" />
            <StatTile label="Aktiv" value={summary.tenants.active} tone="success" icon="✅" />
            <StatTile label="Trial" value={summary.tenants.trial} tone="info" icon="🧪" />
            <StatTile label="Gesperrt" value={summary.tenants.suspended} tone="warning" icon="⏸" />
            <StatTile label="Geschlossen" value={summary.tenants.closed} tone="danger" icon="🚫" />
          </div>

          <h3 style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: "1.5rem 0 0.75rem" }}>
            Plattformweit
          </h3>
          <div style={gridStyle}>
            <StatTile label="Benutzer" value={summary.users} icon="👤" />
            <StatTile label="Produkte" value={summary.products} icon="📦" />
            <StatTile label="Einheiten" value={summary.units} icon="🏷" />
            <StatTile label="Dokumente" value={summary.documents} icon="📄" />
            <StatTile label="Aktive Veröffentlichungen" value={summary.activePublications} tone="success" icon="🌐" />
            <StatTile label="Speicher" value={formatFileSize(summary.storageBytes)} icon="💾" />
          </div>
        </>
      )}
    </div>
  );
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "var(--space-4)",
} as const;
