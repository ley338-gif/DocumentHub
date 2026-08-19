import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, ErrorState, LoadingState, PageHeader, Tabs } from "../../design-system";
import type { DocumentDto, DocumentRevisionDto } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { hasRole } from "../../lib/roles";
import { useCurrentRole } from "../auth/useCurrentRole";
import { HistoryTab } from "../shared/HistoryTab";
import { getDocument, listRevisions } from "./api";
import { OverviewTab } from "./tabs/OverviewTab";
import { RevisionsTab } from "./tabs/RevisionsTab";
import { ApplicabilityTab } from "./tabs/ApplicabilityTab";
import { PublicationsTab } from "./tabs/PublicationsTab";
import { FilesTab } from "./tabs/FilesTab";

const TABS = [
  { key: "overview", label: "Übersicht" },
  { key: "revisions", label: "Revisionen" },
  { key: "applicability", label: "Anwendbarkeit" },
  { key: "publications", label: "Veröffentlichungen" },
  { key: "files", label: "Dateien" },
  { key: "history", label: "Verlauf" },
];

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useCurrentRole();
  const canWrite = hasRole(role, "EDITOR");

  const [doc, setDoc] = useState<DocumentDto | null>(null);
  const [revisions, setRevisions] = useState<DocumentRevisionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  function reload() {
    if (!id) return;
    setLoading(true);
    Promise.all([getDocument(id), listRevisions(id)])
      .then(([d, revs]) => {
        setDoc(d);
        setRevisions(revs);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.userMessage : "Dokument konnte nicht geladen werden.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <LoadingState label="Dokument wird geladen…" />;
  if (error || !doc || !id) {
    return (
      <div>
        <ErrorState error={error} fallback="Dokument nicht gefunden." />
        <Button variant="secondary" onClick={() => navigate("/app/documents")} style={{ marginTop: "1rem" }}>
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={doc.name}
        subtitle={doc.documentType}
        breadcrumbs={[{ label: "Dokumente", to: "/app/documents" }, { label: doc.name }]}
      />
      <Tabs items={TABS} activeKey={activeTab} onChange={setActiveTab} />
      <div style={{ marginTop: "1.5rem" }}>
        {activeTab === "overview" && <OverviewTab document={doc} canWrite={canWrite} onUpdated={setDoc} />}
        {activeTab === "revisions" && (
          <RevisionsTab documentId={id} revisions={revisions} role={role} onChanged={reload} />
        )}
        {activeTab === "applicability" && <ApplicabilityTab revisions={revisions} />}
        {activeTab === "publications" && <PublicationsTab documentId={id} />}
        {activeTab === "files" && <FilesTab documentId={id} canWrite={canWrite} onUploaded={reload} />}
        {activeTab === "history" && <HistoryTab objectLabel="dieses Dokument" />}
      </div>
    </div>
  );
}
