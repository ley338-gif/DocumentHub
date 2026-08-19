import { useEffect, useState } from "react";
import { Spinner, StatusBadge, Table, type TableColumn } from "../../../design-system";
import type { PublicationDto } from "../../../lib/api-types";
import { ApiError } from "../../../lib/api-error";
import { listPublicationsForDocument } from "../api";

export interface PublicationsTabProps {
  documentId: string;
}

/** Read-only list this run — publishing/revoking is the publish wizard,
 * a later phase. */
export function PublicationsTab({ documentId }: PublicationsTabProps) {
  const [items, setItems] = useState<PublicationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPublicationsForDocument(documentId)
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.userMessage : "Veröffentlichungen konnten nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const columns: TableColumn<PublicationDto>[] = [
    { key: "revision", header: "Revision", render: (p) => p.snapshot?.revision ?? "–" },
    { key: "language", header: "Sprache", render: (p) => p.snapshot?.language ?? "–" },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
    { key: "publishedAt", header: "Veröffentlicht am", render: (p) => new Date(p.publishedAt).toLocaleString("de-DE") },
  ];

  if (loading) return <Spinner centered />;

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <Table columns={columns} rows={items} rowKey={(p) => p.id} emptyMessage="Keine Veröffentlichungen." />
    </div>
  );
}
