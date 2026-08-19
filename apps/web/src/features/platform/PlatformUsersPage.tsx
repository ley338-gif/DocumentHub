import { useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  Pagination,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  type TableColumn,
  useToast,
} from "../../design-system";
import type { PlatformUserDto } from "../../lib/api-types";
import { usePaginated } from "../../lib/use-paginated";
import { ApiError } from "../../lib/api-error";
import { listPlatformUsers, updatePlatformUserStatus } from "./api";

const STATUS_OPTIONS = [
  { value: "", label: "Alle Status" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "SUSPENDED", label: "Gesperrt" },
];

export function PlatformUsersPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [detailUser, setDetailUser] = useState<PlatformUserDto | null>(null);
  const [confirming, setConfirming] = useState(false);

  const query = { search: search || undefined, status: (status || undefined) as "ACTIVE" | "SUSPENDED" | undefined };
  const { items, total, page, pageSize, setPage, loading, error, reload } = usePaginated<PlatformUserDto>(
    (p, ps) => listPlatformUsers({ ...query, page: p, pageSize: ps }),
    [search, status],
  );

  async function toggleStatus(user: PlatformUserDto) {
    const nextStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setConfirming(true);
    try {
      const updated = await updatePlatformUserStatus(user.id, nextStatus);
      toast.show({ message: "Status aktualisiert.", tone: "success" });
      setDetailUser(updated);
      reload();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Status konnte nicht geändert werden.", tone: "danger" });
    } finally {
      setConfirming(false);
    }
  }

  const columns: TableColumn<PlatformUserDto>[] = [
    { key: "name", header: "Name", render: (u) => u.fullName },
    { key: "email", header: "E-Mail", render: (u) => u.email },
    { key: "status", header: "Status", render: (u) => <StatusBadge status={u.status} /> },
    {
      key: "organizations",
      header: "Organisationen",
      render: (u) =>
        u.memberships.length === 0 ? "—" : u.memberships.map((m) => `${m.organizationName} (${m.role})`).join(", "),
    },
    { key: "createdAt", header: "Erstellt am", render: (u) => new Date(u.createdAt).toLocaleDateString("de-DE") },
    {
      key: "lastLoginAt",
      header: "Letzte Anmeldung",
      render: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("de-DE") : "—"),
    },
  ];

  return (
    <div>
      <PageHeader title="Benutzer" subtitle="Alle Benutzer der Plattform, organisationsübergreifend." />

      <FilterBar>
        <input
          type="search"
          placeholder="Suche nach Name oder E-Mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sm)", minWidth: "220px" }}
        />
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} />
      </FilterBar>

      {loading && <LoadingState label="Benutzer werden geladen…" />}
      {error && <ErrorState error={error} fallback="Benutzer konnten nicht geladen werden." />}
      {!loading && !error && (
        <>
          <Table
            columns={columns}
            rows={items}
            rowKey={(u) => u.id}
            onRowClick={(u) => setDetailUser(u)}
            emptyMessage={<EmptyState title="Keine Benutzer gefunden" description="Passen Sie die Filter an." />}
          />
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </>
      )}

      <Dialog open={detailUser !== null} onClose={() => setDetailUser(null)} title={detailUser?.fullName ?? "Benutzer"}>
        {detailUser && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: "22rem" }}>
            <div>
              <strong>{detailUser.email}</strong>
              <div style={{ marginTop: "0.5rem" }}>
                <StatusBadge status={detailUser.status} />
                {detailUser.platformRole === "PLATFORM_ADMIN" && (
                  <span style={{ marginLeft: "0.5rem" }}>
                    <Badge tone="info">Platform Admin</Badge>
                  </span>
                )}
              </div>
            </div>
            <div>
              <strong style={{ fontSize: "var(--font-size-sm)" }}>Mitgliedschaften</strong>
              {detailUser.memberships.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>Keine.</p>
              ) : (
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                  {detailUser.memberships.map((m) => (
                    <li key={m.organizationId} style={{ fontSize: "var(--font-size-sm)" }}>
                      {m.organizationName} — {m.role} ({m.status})
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant={detailUser.status === "ACTIVE" ? "danger" : "primary"} onClick={() => toggleStatus(detailUser)} disabled={confirming}>
                {confirming ? "Wird geändert…" : detailUser.status === "ACTIVE" ? "Sperren" : "Reaktivieren"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
