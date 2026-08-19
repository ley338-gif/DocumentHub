import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, StatusBadge, Table, type TableColumn, useToast } from "../../../design-system";
import type { DocumentRevisionDto } from "../../../lib/api-types";
import { formatFileSize, languageLabel } from "../../../lib/format";
import { hasRole } from "../../../lib/roles";
import { ApiError } from "../../../lib/api-error";
import { approveRevision, downloadRevisionFile, retireRevision, submitRevision } from "../api";

export interface RevisionsTabProps {
  documentId: string;
  revisions: DocumentRevisionDto[];
  role: string | undefined;
  onChanged: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Entwurf",
  IN_REVIEW: "In Prüfung",
  APPROVED: "Freigegeben",
  RETIRED: "Zurückgezogen",
};

export function RevisionsTab({ documentId, revisions, role, onChanged }: RevisionsTabProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function runTransition(
    action: (docId: string, id: string) => Promise<DocumentRevisionDto>,
    revisionId: string,
    successMessage: string,
  ) {
    setBusyId(revisionId);
    try {
      await action(documentId, revisionId);
      toast.show({ message: successMessage, tone: "success" });
      onChanged();
    } catch (err) {
      // Always show the real backend error — the buttons below only render
      // when the transition looks legal client-side, but the server is the
      // actual guard (e.g. a concurrent transition by another user).
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Aktion fehlgeschlagen.", tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(revision: DocumentRevisionDto) {
    try {
      await downloadRevisionFile(documentId, revision.id, revision.originalFilename);
    } catch (err) {
      toast.show({ message: err instanceof Error ? err.message : "Download fehlgeschlagen.", tone: "danger" });
    }
  }

  const columns: TableColumn<DocumentRevisionDto>[] = [
    { key: "revision", header: "Revision", render: (r) => r.revision },
    { key: "language", header: "Sprache", render: (r) => languageLabel(r.language) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} label={STATUS_LABEL[r.status]} /> },
    { key: "uploadedAt", header: "Hochgeladen am", render: (r) => new Date(r.uploadedAt).toLocaleString("de-DE") },
    { key: "fileSize", header: "Dateigröße", render: (r) => formatFileSize(r.fileSize) },
    {
      key: "actions",
      header: "",
      render: (r) => {
        const busy = busyId === r.id;
        const buttons: React.ReactNode[] = [
          <Button key="dl" variant="ghost" size="sm" onClick={() => handleDownload(r)}>
            Herunterladen
          </Button>,
        ];
        if (r.status === "DRAFT" && hasRole(role, "EDITOR")) {
          buttons.push(
            <Button
              key="submit"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => runTransition(submitRevision, r.id, "Revision zur Prüfung eingereicht.")}
            >
              Einreichen
            </Button>,
          );
        }
        if (r.status === "IN_REVIEW" && hasRole(role, "PUBLISHER")) {
          buttons.push(
            <Button
              key="approve"
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => runTransition(approveRevision, r.id, "Revision freigegeben.")}
            >
              Freigeben
            </Button>,
          );
        }
        if (r.status === "APPROVED" && hasRole(role, "PUBLISHER")) {
          buttons.push(
            <Button
              key="publish"
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => navigate(`/app/documents/${documentId}/publish/${r.id}`)}
            >
              Veröffentlichen
            </Button>,
          );
          buttons.push(
            <Button
              key="retire"
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => runTransition(retireRevision, r.id, "Revision zurückgezogen.")}
            >
              Zurückziehen
            </Button>,
          );
        }
        return <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>{buttons}</div>;
      },
    },
  ];

  return (
    <Table
      columns={columns}
      rows={revisions}
      rowKey={(r) => r.id}
      emptyMessage="Keine Revisionen vorhanden. Laden Sie eine Datei im Tab „Dateien“ hoch."
    />
  );
}
