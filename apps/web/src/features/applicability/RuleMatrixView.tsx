import { useState } from "react";
import { Badge, Spinner, Table, type TableColumn } from "../../design-system";
import type { ApplicabilityRuleDto, PublishPreviewDto } from "../../lib/api-types";
import { ConflictBanner } from "./ConflictBanner";

export interface RuleMatrixViewProps {
  canPreview: boolean;
  rules: ApplicabilityRuleDto[];
  preview: PublishPreviewDto | null;
  previewLoading: boolean;
}

interface MatrixRow {
  ruleId: string;
  description: string;
  specificity: number | null;
  affectedUnitsCount: number | null;
  hasConflict: boolean;
  isAlreadyPublished: boolean;
}

type SortKey = "description" | "specificity" | "affectedUnitsCount";

/**
 * Tabular view of the SAME rule list + preview response the builder view
 * uses (passed in as props from the same `useApplicabilityData` call in
 * ApplicabilityTab — not a separate fetch). "Matrix" here means a real,
 * honest table of real rules with their real backend-computed specificity/
 * affected-unit numbers and conflict flags — not a fabricated products ×
 * variants cross-tab the API has no endpoint to populate.
 */
export function RuleMatrixView({ canPreview, rules, preview, previewLoading }: RuleMatrixViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("specificity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const previewByRuleId = new Map((preview?.rules ?? []).map((r) => [r.ruleId, r]));

  const rows: MatrixRow[] = rules.map((rule) => {
    const rp = previewByRuleId.get(rule.id);
    const ruleConflicts = preview?.conflicts.filter((c) => c.newRuleId === rule.id) ?? [];
    const hasConflict = ruleConflicts.some((c) => c.reason !== "ALREADY_PUBLISHED");
    return {
      ruleId: rule.id,
      description: rp?.description ?? "(Beschreibung folgt nach Vorschau-Aktualisierung)",
      specificity: rp?.specificity ?? null,
      affectedUnitsCount: rp?.affectedUnitsCount ?? null,
      hasConflict,
      isAlreadyPublished: ruleConflicts.length > 0 && !hasConflict,
    };
  });

  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "description") return a.description.localeCompare(b.description) * dir;
    const av = a[sortKey] ?? -1;
    const bv = b[sortKey] ?? -1;
    return (av - bv) * dir;
  });

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortHeader(key: SortKey, label: string) {
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", padding: 0 }}
      >
        {label} {sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : ""}
      </button>
    );
  }

  const columns: TableColumn<MatrixRow>[] = [
    { key: "description", header: sortHeader("description", "Scope-Beschreibung"), render: (r) => r.description },
    {
      key: "specificity",
      header: sortHeader("specificity", "Spezifität"),
      render: (r) => (r.specificity !== null ? r.specificity : "–"),
    },
    {
      key: "affected",
      header: sortHeader("affectedUnitsCount", "Betroffene Einheiten"),
      render: (r) => (r.affectedUnitsCount !== null ? r.affectedUnitsCount : "–"),
    },
    {
      key: "conflict",
      header: "Konflikt",
      render: (r) =>
        r.hasConflict ? (
          <Badge tone="danger">Ja</Badge>
        ) : r.isAlreadyPublished ? (
          <Badge tone="neutral">Bereits veröffentlicht</Badge>
        ) : (
          <Badge tone="success">Nein</Badge>
        ),
    },
  ];

  return (
    <div>
      {!canPreview && (
        <p style={{ color: "var(--color-text-secondary, #666)", marginBottom: "1rem" }}>
          Als Betrachter sehen Sie die Regelliste ohne Spezifität/betroffene Einheiten/Konfliktstatus — diese Zahlen
          kommen aus der Editor+-geschützten Vorschau-API.
        </p>
      )}
      {canPreview && previewLoading && !preview && <Spinner size={24} />}
      {canPreview && preview && <ConflictBanner conflicts={preview.conflicts} />}
      {canPreview && preview && (
        <p style={{ marginBottom: "1rem" }}>
          Gesamt betroffene Einheiten (Vereinigung aller Regeln): <strong>{preview.totalAffectedUnitsCount}</strong>
        </p>
      )}
      <Table columns={columns} rows={sorted} rowKey={(r) => r.ruleId} emptyMessage="Keine Anwendbarkeitsregeln." />
    </div>
  );
}
