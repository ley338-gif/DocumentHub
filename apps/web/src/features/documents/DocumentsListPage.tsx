import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, PageHeader, Pagination, StatusBadge, Table, type TableColumn } from "../../design-system";
import type { DocumentDto, DocumentRevisionDto } from "../../lib/api-types";
import { languageLabel } from "../../lib/format";
import { usePaginated } from "../../lib/use-paginated";
import { hasRole } from "../../lib/roles";
import { useCurrentRole } from "../auth/useCurrentRole";
import { listDocuments, listRevisions } from "./api";
import { CreateDocumentDialog } from "./CreateDocumentDialog";

/** Best "current" revision per spec §61: prefer the latest APPROVED
 * revision, falling back to the most recently created revision of any
 * status if none is approved yet — derived client-side since the API
 * doesn't compute this itself (documents.service.ts returns the bare
 * Document row; revisions come from a separate endpoint). */
function currentRevisionLabel(revisions: DocumentRevisionDto[]): string {
  if (revisions.length === 0) return "–";
  const approved = revisions.filter((r) => r.status === "APPROVED");
  const pick = approved.length > 0 ? approved : revisions;
  const latest = [...pick].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return latest.revision;
}

function languagesLabel(revisions: DocumentRevisionDto[]): string {
  const langs = Array.from(new Set(revisions.map((r) => r.language)));
  if (langs.length === 0) return "–";
  return langs.map(languageLabel).join(", ");
}

export function DocumentsListPage() {
  const navigate = useNavigate();
  const role = useCurrentRole();
  const canWrite = hasRole(role, "EDITOR");

  const { items, total, page, pageSize, setPage, loading, error, reload } = usePaginated<DocumentDto>(
    (p, ps) => listDocuments({ page: p, pageSize: ps }),
    [],
  );

  const [revisionsByDoc, setRevisionsByDoc] = useState<Record<string, DocumentRevisionDto[]>>({});
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all(items.map((d) => listRevisions(d.id).then((revs) => [d.id, revs] as const)))
      .then((pairs) => {
        if (cancelled) return;
        setRevisionsByDoc(Object.fromEntries(pairs));
      })
      .catch(() => {
        if (!cancelled) setRevisionsByDoc({});
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const columns: TableColumn<DocumentDto>[] = [
    { key: "name", header: "Dokumentname", render: (d) => d.name },
    { key: "type", header: "Typ", render: (d) => d.documentType },
    { key: "languages", header: "Sprachen", render: (d) => languagesLabel(revisionsByDoc[d.id] ?? []) },
    { key: "revision", header: "Aktuelle Revision", render: (d) => currentRevisionLabel(revisionsByDoc[d.id] ?? []) },
    { key: "status", header: "Status", render: (d) => <StatusBadge status={d.status} /> },
    { key: "updatedAt", header: "Zuletzt geändert", render: (d) => new Date(d.updatedAt).toLocaleString("de-DE") },
  ];

  return (
    <div>
      <PageHeader
        title="Dokumente"
        subtitle="Dokumente und ihre Revisionen."
        actions={canWrite ? <Button onClick={() => setCreateOpen(true)}>Neues Dokument</Button> : undefined}
      />

      {error && <p role="alert">{error}</p>}

      <Table
        columns={columns}
        rows={items}
        rowKey={(d) => d.id}
        onRowClick={(d) => navigate(`/app/documents/${d.id}`)}
        emptyMessage={loading ? "Lädt…" : "Keine Dokumente vorhanden."}
      />

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      <CreateDocumentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(doc) => {
          setCreateOpen(false);
          reload();
          navigate(`/app/documents/${doc.id}`);
        }}
      />
    </div>
  );
}
