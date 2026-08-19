import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState, Table, type TableColumn } from "../../../design-system";
import type { PublicationSnapshotDto } from "../../../lib/api-types";
import { ApiError } from "../../../lib/api-error";
import { resolvePublicationsForProduct } from "../api";

export interface DocumentationTabProps {
  productId: string;
}

/** Read-only: the domain model has no direct Product -> Document ownership,
 * only applicability-driven resolution. This shows what's CURRENTLY
 * applicable to this product (via GET /api/publications/resolve?productId=),
 * not a raw "documents belonging to this product" list — labeled honestly
 * as such below. */
export function DocumentationTab({ productId }: DocumentationTabProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<PublicationSnapshotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    resolvePublicationsForProduct(productId)
      .then((res) => {
        if (!cancelled) setItems(res.resolved);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.userMessage : "Konnte nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const columns: TableColumn<PublicationSnapshotDto>[] = [
    { key: "name", header: "Dokument", render: (s) => s.documentName },
    { key: "type", header: "Typ", render: (s) => s.documentType },
    { key: "revision", header: "Revision", render: (s) => s.revision },
    { key: "language", header: "Sprache", render: (s) => s.language },
  ];

  if (loading) return <LoadingState label="Dokumente werden geladen…" />;
  if (error) return <ErrorState error={error} fallback="Dokumente konnten nicht geladen werden." />;

  return (
    <div>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        Aktuell für dieses Produkt anwendbare Dokumente (per Auflösung der Anwendbarkeitsregeln, keine direkte
        Eigentümerschaft im Datenmodell).
      </p>
      <Table
        columns={columns}
        rows={items}
        rowKey={(s) => s.id}
        onRowClick={(s) => navigate(`/app/documents/${s.documentId}`)}
        emptyMessage={<EmptyState title="Keine aktuell anwendbaren Dokumente" description="Für dieses Produkt ist derzeit keine Dokumentation veröffentlicht." />}
      />
    </div>
  );
}
