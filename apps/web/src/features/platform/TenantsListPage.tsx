import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
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
} from "../../design-system";
import type { PlatformTenantListItemDto, TenantLifecycleStatus } from "../../lib/api-types";
import { usePaginated } from "../../lib/use-paginated";
import { formatFileSize } from "../../lib/format";
import { listTenants } from "./api";
import { CreateTenantWizard } from "./CreateTenantWizard";

const STATUS_OPTIONS = [
  { value: "", label: "Alle Status" },
  { value: "TRIAL", label: "Trial" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "SUSPENDED", label: "Gesperrt" },
  { value: "CLOSED", label: "Geschlossen" },
];

export function TenantsListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const query = { search: search || undefined, status: (status || undefined) as TenantLifecycleStatus | undefined };
  const { items, total, page, pageSize, setPage, loading, error, reload } = usePaginated<PlatformTenantListItemDto>(
    (p, ps) => listTenants({ ...query, page: p, pageSize: ps }),
    [search, status],
  );

  const columns: TableColumn<PlatformTenantListItemDto>[] = [
    { key: "name", header: "Tenant", render: (t) => t.name },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    { key: "users", header: "Benutzer", render: (t) => t.users },
    { key: "products", header: "Produkte", render: (t) => t.products },
    { key: "units", header: "Einheiten", render: (t) => t.units },
    { key: "documents", header: "Dokumente", render: (t) => t.documents },
    { key: "activePublications", header: "Aktive Veröffentlichungen", render: (t) => t.activePublications },
    { key: "storage", header: "Speicher", render: (t) => formatFileSize(t.storageBytes) },
    { key: "createdAt", header: "Erstellt am", render: (t) => new Date(t.createdAt).toLocaleDateString("de-DE") },
  ];

  return (
    <div>
      <PageHeader
        title="Tenants"
        subtitle="Kundenorganisationen dieser Plattform."
        actions={<Button onClick={() => setWizardOpen(true)}>Neuer Tenant</Button>}
      />

      <FilterBar>
        <input
          type="search"
          placeholder="Suche nach Name oder Slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sm)", minWidth: "220px" }}
        />
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} />
      </FilterBar>

      {loading && <LoadingState label="Tenants werden geladen…" />}
      {error && <ErrorState error={error} fallback="Tenants konnten nicht geladen werden." />}
      {!loading && !error && (
        <>
          <Table
            columns={columns}
            rows={items}
            rowKey={(t) => t.id}
            onRowClick={(t) => navigate(`/platform/tenants/${t.id}`)}
            emptyMessage={
              <EmptyState
                title="Keine Tenants gefunden"
                description="Legen Sie den ersten Tenant an."
                action={<Button onClick={() => setWizardOpen(true)}>Neuer Tenant</Button>}
              />
            }
          />
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </>
      )}

      <CreateTenantWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          setWizardOpen(false);
          reload();
        }}
      />
    </div>
  );
}
