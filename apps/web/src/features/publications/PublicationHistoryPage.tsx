import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
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
import type { DocumentDto, Product, PublicationDto, PublicationStatus } from "../../lib/api-types";
import { usePaginated } from "../../lib/use-paginated";
import { listDocuments } from "../documents/api";
import { listProducts } from "../products/api";
import { listPublicationHistory } from "./api";
import { summarizeRules } from "./ruleFormat";
import { PublicationDetailDrawer } from "./PublicationDetailDrawer";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Alle Status" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "SUPERSEDED", label: "Abgelöst" },
  { value: "REVOKED", label: "Widerrufen" },
];

/**
 * Publication History (spec: Gate 1). Server-paginated via the shared
 * usePaginated hook, every filter (product/document/status/date range) is
 * forwarded as a real GET /api/publications query param — no client-side
 * filtering of a locally cached page, ever.
 *
 * CRITICAL DATA-SOURCE INVARIANT: every name shown here (document name,
 * product/variant/batch/unit names inside the applicability scope) comes
 * from `publication.snapshot` — the frozen record written at publish time.
 * This screen must NEVER call GET /api/products/:id or GET /api/documents/:id
 * to resolve a display name for anything inside a publication's historical
 * context; doing so would show today's live name instead of what was true
 * when the publication was created (e.g. after a product rename). The
 * product/document FILTER dropdowns below are the one exception — they
 * source live product/document lists on purpose, because picking a filter
 * value is a live, present-tense action, not a historical rendering.
 */
export function PublicationHistoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [productId, setProductId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  // Supports deep-linking straight into a publication's detail drawer via
  // ?open=<id> — used by the Audit UI's Publication resource links.
  const [detailId, setDetailId] = useState<string | null>(searchParams.get("open"));

  function closeDetail() {
    setDetailId(null);
    if (searchParams.has("open")) {
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
  }

  useEffect(() => {
    // 100 is the backend's MAX_PAGE_SIZE (see common/pagination.ts) — this
    // filter dropdown covers the first 100 products/documents, a pragmatic
    // MVP limit for a searchable-select-style filter, not a paginated list.
    listProducts({ pageSize: 100 }).then((res) => setProducts(res.items)).catch(() => setProducts([]));
    listDocuments({ pageSize: 100 }).then((res) => setDocuments(res.items)).catch(() => setDocuments([]));
  }, []);

  const query = {
    status: (status || undefined) as PublicationStatus | undefined,
    documentId: documentId || undefined,
    productId: productId || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const { items, total, page, pageSize, setPage, loading, error } = usePaginated<PublicationDto>(
    (p, ps) => listPublicationHistory(query, p, ps),
    [status, documentId, productId, from, to],
  );

  const filtersActive = Boolean(status || documentId || productId || from || to);

  const columns: TableColumn<PublicationDto>[] = [
    {
      key: "publishedAt",
      header: "Veröffentlicht am",
      render: (p) =>
        new Date(p.publishedAt).toLocaleString("de-DE", {
          dateStyle: "medium",
          timeStyle: "medium",
        }),
    },
    {
      key: "document",
      header: "Dokument",
      render: (p) =>
        p.snapshot ? (
          <a
            href={`/app/documents/${p.snapshot.documentId}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/app/documents/${p.snapshot!.documentId}`);
            }}
          >
            {p.snapshot.documentName}
          </a>
        ) : (
          "—"
        ),
    },
    {
      key: "revision",
      header: "Revision / Sprache",
      render: (p) => (p.snapshot ? `${p.snapshot.revision} · ${p.snapshot.language}` : "—"),
    },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
    { key: "publishedBy", header: "Veröffentlicht von", render: (p) => p.publishedByName ?? "—" },
    {
      key: "scope",
      header: "Anwendbarkeit (zum Zeitpunkt der Veröffentlichung)",
      render: (p) => (p.snapshot ? summarizeRules(p.snapshot.applicabilityRules ?? []) : "—"),
    },
  ];

  return (
    <div>
      <PageHeader title="Veröffentlichungshistorie" subtitle="Alle Veröffentlichungen — aktiv, abgelöst und widerrufen." />

      <FilterBar>
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUS_OPTIONS}
        />
        <Select
          aria-label="Produkt"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          options={[{ value: "", label: "Alle Produkte" }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
        />
        <Select
          aria-label="Dokument"
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          options={[{ value: "", label: "Alle Dokumente" }, ...documents.map((d) => ({ value: d.id, label: d.name }))]}
        />
        <input
          type="date"
          aria-label="Von"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sm)" }}
        />
        <input
          type="date"
          aria-label="Bis"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sm)" }}
        />
      </FilterBar>

      <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        Hinweis: Der Produktfilter erfasst nur Regeln mit direkter Produktzuordnung (keine reine
        Produktfamilien-/Varianten-/Chargen-/Einheiten-Regel) — siehe Dokumentation zur Anwendbarkeitsauflösung.
      </p>

      {loading && <LoadingState label="Veröffentlichungen werden geladen…" />}
      {error && <ErrorState error={error} fallback="Veröffentlichungen konnten nicht geladen werden." />}
      {!loading && !error && (
        <>
          <Table
            columns={columns}
            rows={items}
            rowKey={(p) => p.id}
            onRowClick={(p) => setDetailId(p.id)}
            emptyMessage={
              filtersActive ? (
                <EmptyState title="Keine Veröffentlichungen gefunden" description="Passen Sie die Filter an." />
              ) : (
                <EmptyState title="Noch keine Veröffentlichungen" description="Diese Organisation hat bisher nichts veröffentlicht." />
              )
            }
          />
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </>
      )}

      <PublicationDetailDrawer publicationId={detailId} onClose={closeDetail} />
    </div>
  );
}
