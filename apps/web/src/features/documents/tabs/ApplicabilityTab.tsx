import { useEffect, useState } from "react";
import { Select, Spinner } from "../../../design-system";
import type { ApplicabilityRuleDto, DocumentRevisionDto } from "../../../lib/api-types";
import { ApiError } from "../../../lib/api-error";
import { listApplicabilityRules } from "../api";

export interface ApplicabilityTabProps {
  revisions: DocumentRevisionDto[];
}

/** Plain-language rendering of one rule's scoping fields — reuses the raw
 * field names/values the API returns as-is (ids, dates, serial strings), no
 * matching logic re-implemented client-side. */
function describeRule(rule: ApplicabilityRuleDto): string[] {
  const parts: string[] = [];
  if (rule.explicitExclusion) parts.push("Ausdrücklicher Ausschluss");
  if (rule.productFamilyId) parts.push(`Produktfamilie-ID: ${rule.productFamilyId}`);
  if (rule.productId) parts.push(`Produkt-ID: ${rule.productId}`);
  if (rule.variantId) parts.push(`Varianten-ID: ${rule.variantId}`);
  if (rule.batchId) parts.push(`Chargen-ID: ${rule.batchId}`);
  if (rule.unitId) parts.push(`Einheiten-ID: ${rule.unitId}`);
  if (rule.serialFrom || rule.serialTo) {
    parts.push(`Seriennummer: ${rule.serialFrom ?? "…"} bis ${rule.serialTo ?? "…"}`);
  }
  if (rule.validFrom || rule.validUntil) {
    const from = rule.validFrom ? new Date(rule.validFrom).toLocaleDateString("de-DE") : "…";
    const until = rule.validUntil ? new Date(rule.validUntil).toLocaleDateString("de-DE") : "…";
    parts.push(`Gültig: ${from} bis ${until}`);
  }
  if (parts.length === 0) parts.push("Gilt für: alle (keine Einschränkung)");
  return parts;
}

export function ApplicabilityTab({ revisions }: ApplicabilityTabProps) {
  const sorted = [...revisions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const [revisionId, setRevisionId] = useState(sorted[0]?.id ?? "");
  const [rules, setRules] = useState<ApplicabilityRuleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!revisionId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listApplicabilityRules(revisionId)
      .then((res) => {
        if (!cancelled) setRules(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.userMessage : "Regeln konnten nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revisionId]);

  if (sorted.length === 0) {
    return <p>Keine Revisionen vorhanden — es gibt noch keine Anwendbarkeitsregeln zu zeigen.</p>;
  }

  return (
    <div>
      <p style={{ marginBottom: "1rem", color: "var(--color-text-secondary, #666)" }}>
        Nur lesend: Diese Ansicht zeigt die vorhandenen Anwendbarkeitsregeln der gewählten Revision. Der Editor zum
        Anlegen/Bearbeiten von Regeln folgt in einer späteren Phase.
      </p>
      <div style={{ maxWidth: "20rem", marginBottom: "1rem" }}>
        <Select
          label="Revision"
          value={revisionId}
          onChange={(e) => setRevisionId(e.target.value)}
          options={sorted.map((r) => ({ value: r.id, label: `${r.revision} (${r.language})` }))}
        />
      </div>
      {loading && <Spinner />}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && rules.length === 0 && <p>Keine Anwendbarkeitsregeln für diese Revision.</p>}
      {!loading && !error && rules.length > 0 && (
        <ul>
          {rules.map((rule) => (
            <li key={rule.id} style={{ marginBottom: "0.5rem" }}>
              {describeRule(rule).join(" · ")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
