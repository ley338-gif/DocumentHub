import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Button,
  Dialog,
  DescriptionItem,
  DescriptionList,
  ErrorState,
  LoadingState,
  PageHeader,
  StatTile,
  StatusBadge,
  useToast,
} from "../../design-system";
import type { PlatformTenantDetailDto, TenantLifecycleStatus } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { formatFileSize } from "../../lib/format";
import { getTenant, updateTenantStatus } from "./api";

const STATUS_ACTIONS: { status: TenantLifecycleStatus; label: string; variant: "primary" | "secondary" | "danger" }[] = [
  { status: "ACTIVE", label: "Aktivieren", variant: "primary" },
  { status: "SUSPENDED", label: "Sperren", variant: "danger" },
  { status: "CLOSED", label: "Schließen", variant: "danger" },
];

export function TenantDetailPage() {
  const { id = "" } = useParams();
  const toast = useToast();
  const [tenant, setTenant] = useState<PlatformTenantDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [pendingStatus, setPendingStatus] = useState<TenantLifecycleStatus | null>(null);
  const [confirming, setConfirming] = useState(false);

  function load() {
    setLoading(true);
    getTenant(id)
      .then(setTenant)
      .catch(setError)
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    setConfirming(true);
    try {
      const updated = await updateTenantStatus(id, pendingStatus);
      setTenant((prev) => (prev ? { ...prev, status: updated.status } : prev));
      toast.show({ message: "Status aktualisiert.", tone: "success" });
      setPendingStatus(null);
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Status konnte nicht geändert werden.", tone: "danger" });
    } finally {
      setConfirming(false);
    }
  }

  if (loading) return <LoadingState label="Tenant wird geladen…" />;
  if (error != null || !tenant) return <ErrorState error={error} fallback="Tenant konnte nicht geladen werden." />;

  return (
    <div>
      <PageHeader
        title={tenant.name}
        subtitle={tenant.slug}
        breadcrumbs={[{ label: "Tenants", to: "/platform/tenants" }, { label: tenant.name }]}
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {STATUS_ACTIONS.filter((a) => a.status !== tenant.status).map((a) => (
              <Button key={a.status} variant={a.variant} onClick={() => setPendingStatus(a.status)}>
                {a.label}
              </Button>
            ))}
          </div>
        }
      />

      <DescriptionList>
        <DescriptionItem label="Status" value={<StatusBadge status={tenant.status} />} />
        <DescriptionItem label="Stabile ID" value={<code>{tenant.stableId}</code>} />
        <DescriptionItem label="Standardsprache" value={tenant.defaultLanguage} />
        <DescriptionItem label="Zeitzone" value={tenant.timezone} />
        <DescriptionItem label="Erstellt am" value={new Date(tenant.createdAt).toLocaleString("de-DE")} />
      </DescriptionList>

      <h3 style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: "1.5rem 0 0.75rem" }}>
        Nutzung
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)" }}>
        <StatTile label="Benutzer" value={tenant.usage.users} icon="👤" />
        <StatTile label="Produkte" value={tenant.usage.products} icon="📦" />
        <StatTile label="Varianten" value={tenant.usage.variants} icon="🔧" />
        <StatTile label="Einheiten" value={tenant.usage.units} icon="🏷" />
        <StatTile label="Dokumente" value={tenant.usage.documents} icon="📄" />
        <StatTile label="Revisionen" value={tenant.usage.revisions} icon="📝" />
        <StatTile label="Aktive Veröffentlichungen" value={tenant.usage.activePublications} tone="success" icon="🌐" />
        <StatTile label="Speicher" value={formatFileSize(tenant.usage.storageBytes)} icon="💾" />
      </div>

      <Dialog open={pendingStatus !== null} onClose={() => setPendingStatus(null)} title="Status ändern">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: "20rem" }}>
          <p>
            Status von <strong>{tenant.name}</strong> wirklich auf <strong>{pendingStatus}</strong> ändern?
            {pendingStatus === "SUSPENDED" && " Neue Veröffentlichungen und Änderungen werden blockiert; bereits veröffentlichte Dokumentation bleibt öffentlich erreichbar."}
            {pendingStatus === "CLOSED" && " Der Tenant kann sich nicht mehr anmelden; Daten bleiben erhalten."}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setPendingStatus(null)} disabled={confirming}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={confirmStatusChange} disabled={confirming}>
              {confirming ? "Wird geändert…" : "Bestätigen"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
