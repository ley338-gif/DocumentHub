import { useState } from "react";
import { Select, Tabs } from "../../../design-system";
import type { DocumentRevisionDto } from "../../../lib/api-types";
import { hasRole } from "../../../lib/roles";
import { useCurrentRole } from "../../auth/useCurrentRole";
import { RuleBuilderView } from "../../applicability/RuleBuilderView";
import { RuleMatrixView } from "../../applicability/RuleMatrixView";
import { useApplicabilityData } from "../../applicability/useApplicabilityData";

export interface ApplicabilityTabProps {
  revisions: DocumentRevisionDto[];
}

const SUB_TABS = [
  { key: "builder", label: "Regeln (Builder)" },
  { key: "matrix", label: "Matrix" },
];

/**
 * Applicability rule editor for a document revision. Builder and Matrix
 * share one `useApplicabilityData` call (rules + backend preview) so they
 * always render the identical underlying data — see that hook's doc
 * comment and README.md's "pure API consumer" design invariant. Neither
 * sub-view computes specificity, affected-unit counts, or conflicts; both
 * numbers/flags always come straight from
 * GET /api/publications/preview/:revisionId.
 */
export function ApplicabilityTab({ revisions }: ApplicabilityTabProps) {
  const role = useCurrentRole();
  const canWrite = hasRole(role, "EDITOR");
  // The preview endpoint is Editor+ server-side; a Viewer must never call
  // it (that would just be a guaranteed 403 rendered badly).
  const canPreview = hasRole(role, "EDITOR");

  const sorted = [...revisions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const [revisionId, setRevisionId] = useState(sorted[0]?.id ?? "");
  const [subTab, setSubTab] = useState("builder");

  const { rules, rulesLoading, rulesError, preview, previewLoading, previewError, reloadAll, reloadPreview } =
    useApplicabilityData(revisionId || undefined, canPreview);

  if (sorted.length === 0) {
    return <p>Keine Revisionen vorhanden — es gibt noch keine Anwendbarkeitsregeln zu zeigen.</p>;
  }

  return (
    <div>
      <div style={{ maxWidth: "20rem", marginBottom: "1rem" }}>
        <Select
          label="Revision"
          value={revisionId}
          onChange={(e) => setRevisionId(e.target.value)}
          options={sorted.map((r) => ({ value: r.id, label: `${r.revision} (${r.language})` }))}
        />
      </div>

      <Tabs items={SUB_TABS} activeKey={subTab} onChange={setSubTab} />
      <div style={{ marginTop: "1rem" }}>
        {rulesLoading && rules.length === 0 && <p>Regeln werden geladen…</p>}
        {rulesError && <p role="alert">{rulesError}</p>}

        {subTab === "builder" && (
          <RuleBuilderView
            revisionId={revisionId}
            canWrite={canWrite}
            canPreview={canPreview}
            rules={rules}
            preview={preview}
            previewLoading={previewLoading}
            previewError={previewError}
            reloadAll={reloadAll}
            reloadPreview={reloadPreview}
          />
        )}
        {subTab === "matrix" && (
          <RuleMatrixView canPreview={canPreview} rules={rules} preview={preview} previewLoading={previewLoading} />
        )}
      </div>
    </div>
  );
}
