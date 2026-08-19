import { useState } from "react";
import { Drawer, EmptyState, ErrorState, FilterBar, LoadingState, PageHeader, Pagination, Table, type TableColumn } from "../../design-system";
import type { PlatformAuditEventDto } from "../../lib/api-types";
import { usePaginated } from "../../lib/use-paginated";
import { listPlatformAudit } from "./api";

export function PlatformAuditPage() {
  const [action, setAction] = useState("");
  const [detail, setDetail] = useState<PlatformAuditEventDto | null>(null);

  const query = { action: action || undefined };
  const { items, total, page, pageSize, setPage, loading, error } = usePaginated<PlatformAuditEventDto>(
    (p, ps) => listPlatformAudit({ ...query, page: p, pageSize: ps }),
    [action],
  );

  const columns: TableColumn<PlatformAuditEventDto>[] = [
    { key: "timestamp", header: "Zeitpunkt", render: (e) => new Date(e.timestamp).toLocaleString("de-DE") },
    { key: "action", header: "Aktion", render: (e) => e.action },
    { key: "target", header: "Ziel", render: (e) => `${e.targetType} (${e.targetId.slice(0, 8)}…)` },
    { key: "actor", header: "Akteur", render: (e) => e.actorId?.slice(0, 8) ?? "—" },
  ];

  return (
    <div>
      <PageHeader title="Platform Audit" subtitle="Lückenlose, unveränderliche Historie aller Betreiberaktionen." />

      <FilterBar>
        <input
          type="search"
          placeholder="Aktion filtern (z. B. PLATFORM_TENANT_SUSPENDED)…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sm)", minWidth: "300px" }}
        />
      </FilterBar>

      {loading && <LoadingState label="Audit-Log wird geladen…" />}
      {error && <ErrorState error={error} fallback="Audit-Log konnte nicht geladen werden." />}
      {!loading && !error && (
        <>
          <Table
            columns={columns}
            rows={items}
            rowKey={(e) => e.id}
            onRowClick={(e) => setDetail(e)}
            emptyMessage={<EmptyState title="Keine Ereignisse" description="Noch keine Betreiberaktionen protokolliert." />}
          />
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </>
      )}

      <Drawer open={detail !== null} onClose={() => setDetail(null)} title="Audit-Ereignis">
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div>
              <strong>Aktion:</strong> {detail.action}
            </div>
            <div>
              <strong>Zeitpunkt:</strong> {new Date(detail.timestamp).toLocaleString("de-DE")}
            </div>
            <div>
              <strong>Ziel:</strong> {detail.targetType} — <code>{detail.targetId}</code>
            </div>
            <div>
              <strong>Akteur:</strong> <code>{detail.actorId ?? "—"}</code>
            </div>
            <div>
              <strong>Vorher:</strong>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-xs)" }}>{JSON.stringify(detail.before, null, 2) ?? "—"}</pre>
            </div>
            <div>
              <strong>Nachher:</strong>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-xs)" }}>{JSON.stringify(detail.after, null, 2) ?? "—"}</pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
