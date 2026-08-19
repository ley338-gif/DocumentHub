import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, ErrorState, FilterBar, LoadingState, PageHeader, Pagination, Select, Table, type TableColumn } from "../../design-system";
import type { AuditEventDto } from "../../lib/api-types";
import { usePaginated } from "../../lib/use-paginated";
import { KNOWN_ACTIONS, KNOWN_OBJECT_TYPES, listAuditEvents } from "./api";
import { auditEventLabel } from "./action-labels";
import { resourceRoute } from "./object-routes";
import { AuditDetailDrawer } from "./AuditDetailDrawer";

/**
 * Audit UI (spec: Gate 2). Read-only, append-only trail — there is no edit
 * or delete action anywhere on this page or in the backend (see
 * docs/audit.md). Server-paginated via the shared usePaginated hook; every
 * filter (search/action/objectType/actor/date range) is forwarded as a
 * real GET /api/audit query param, never applied client-side to a cached
 * page.
 *
 * Actor filter: sourced from the actorName/actorId values seen in the
 * currently loaded page, NOT from GET /api/organizations/:id/members —
 * that endpoint is Administrator-only server-side, and this page must stay
 * usable for a Viewer. Documented judgment call (see README).
 */
export function AuditLogPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [objectType, setObjectType] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detailEvent, setDetailEvent] = useState<AuditEventDto | null>(null);

  const query = {
    search: search || undefined,
    action: action || undefined,
    objectType: objectType || undefined,
    actorId: actorId || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const { items, total, page, pageSize, setPage, loading, error } = usePaginated<AuditEventDto>(
    (p, ps) => listAuditEvents(query, p, ps),
    [search, action, objectType, actorId, from, to],
  );

  const filtersActive = Boolean(search || action || objectType || actorId || from || to);

  // Actors seen on the currently loaded page — a pragmatic, role-safe
  // source for the filter dropdown (see file-level comment).
  const knownActors = new Map<string, string>();
  for (const e of items) {
    if (e.actorId) knownActors.set(e.actorId, e.actorName ?? e.actorId);
  }
  if (actorId && !knownActors.has(actorId)) knownActors.set(actorId, actorId);

  const columns: TableColumn<AuditEventDto>[] = [
    {
      key: "timestamp",
      header: "Zeitpunkt",
      render: (e) => new Date(e.timestamp).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "medium" }),
    },
    { key: "label", header: "Ereignis", render: (e) => auditEventLabel(e) },
    { key: "actor", header: "Akteur", render: (e) => e.actorName ?? (e.actorId ? e.actorId : "System") },
    {
      key: "resource",
      header: "Ressource",
      render: (e) => {
        const route = resourceRoute(e);
        const text = `${e.objectType} (${e.objectId.slice(0, 8)}…)`;
        if (!route) return text;
        return (
          <a
            href={route}
            onClick={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              navigate(route);
            }}
          >
            {text}
          </a>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Audit-Log" subtitle="Lückenlose, unveränderliche Historie aller kritischen Aktionen." />

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Suche in Action/Typ/Objekt-ID…">
        <Select
          aria-label="Aktion"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          options={[{ value: "", label: "Alle Aktionen" }, ...KNOWN_ACTIONS.map((a) => ({ value: a, label: a }))]}
        />
        <Select
          aria-label="Ressourcentyp"
          value={objectType}
          onChange={(e) => setObjectType(e.target.value)}
          options={[{ value: "", label: "Alle Ressourcentypen" }, ...KNOWN_OBJECT_TYPES.map((t) => ({ value: t, label: t }))]}
        />
        <Select
          aria-label="Akteur"
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
          options={[
            { value: "", label: "Alle Akteure" },
            ...[...knownActors.entries()].map(([id, name]) => ({ value: id, label: name })),
          ]}
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
        Hinweis: Die Suche durchsucht Action, Ressourcentyp und Objekt-ID — nicht den Inhalt von Vorher/Nachher-Daten.
      </p>

      {loading && <LoadingState label="Audit-Log wird geladen…" />}
      {error && <ErrorState error={error} fallback="Audit-Log konnte nicht geladen werden." />}
      {!loading && !error && (
        <>
          <Table
            columns={columns}
            rows={items}
            rowKey={(e) => e.id}
            onRowClick={(e) => setDetailEvent(e)}
            emptyMessage={
              filtersActive ? (
                <EmptyState title="Keine Audit-Ereignisse gefunden" description="Passen Sie die Filter an." />
              ) : (
                <EmptyState title="Noch keine Audit-Ereignisse" description="Für diese Organisation wurden bisher keine Aktionen protokolliert." />
              )
            }
          />
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </>
      )}

      <AuditDetailDrawer event={detailEvent} onClose={() => setDetailEvent(null)} />
    </div>
  );
}
