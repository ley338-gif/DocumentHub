import { useState } from "react";
import { Badge, Button, Dialog, Spinner, useToast } from "../../design-system";
import type { ApplicabilityRuleDto, PublishPreviewDto } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { deleteApplicabilityRule } from "../documents/api";
import { ConflictBanner } from "./ConflictBanner";
import { RuleFormDrawer } from "./RuleFormDrawer";

export interface RuleBuilderViewProps {
  revisionId: string;
  canWrite: boolean;
  canPreview: boolean;
  rules: ApplicabilityRuleDto[];
  preview: PublishPreviewDto | null;
  previewLoading: boolean;
  previewError: string | null;
  reloadAll: () => void;
  reloadPreview: () => void;
}

/** Best-effort raw fallback description shown only until the live preview
 * has loaded (or for a Viewer who can never load it) — never used in place
 * of the backend description once available, and never used to compute a
 * number (specificity/affectedUnitsCount always come from `preview`). */
function fallbackDescription(rule: ApplicabilityRuleDto): string {
  const parts: string[] = [];
  if (rule.productFamilyId) parts.push(`Produktfamilie ${rule.productFamilyId}`);
  if (rule.productId) parts.push(`Produkt ${rule.productId}`);
  if (rule.variantId) parts.push(`Variante ${rule.variantId}`);
  if (rule.batchId) parts.push(`Charge ${rule.batchId}`);
  if (rule.unitId) parts.push(`Einheit ${rule.unitId}`);
  if (rule.serialFrom || rule.serialTo) parts.push(`Seriennummer ${rule.serialFrom ?? "…"}–${rule.serialTo ?? "…"}`);
  if (rule.validFrom) parts.push(`ab ${new Date(rule.validFrom).toLocaleDateString("de-DE")}`);
  if (rule.validUntil) parts.push(`bis ${new Date(rule.validUntil).toLocaleDateString("de-DE")}`);
  const scope = parts.length > 0 ? parts.join(", ") : "Gesamte Organisation (keine Einschränkung)";
  return rule.explicitExclusion ? `Ausschluss: ${scope}` : `Gilt für: ${scope}`;
}

export function RuleBuilderView({
  revisionId,
  canWrite,
  canPreview,
  rules,
  preview,
  previewLoading,
  previewError,
  reloadAll,
  reloadPreview,
}: RuleBuilderViewProps) {
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ApplicabilityRuleDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApplicabilityRuleDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const previewByRuleId = new Map((preview?.rules ?? []).map((r) => [r.ruleId, r]));

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteApplicabilityRule(revisionId, deleteTarget.id);
      toast.show({ message: "Regel gelöscht.", tone: "success" });
      setDeleteTarget(null);
      reloadAll();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Löschen fehlgeschlagen.", tone: "danger" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      {canWrite && (
        <div style={{ marginBottom: "1rem" }}>
          <Button
            onClick={() => {
              setEditingRule(null);
              setDrawerOpen(true);
            }}
          >
            + Regel hinzufügen
          </Button>
        </div>
      )}

      {!canPreview && (
        <p style={{ color: "var(--color-text-secondary, #666)", marginBottom: "1rem" }}>
          Als Betrachter sehen Sie die Regelliste, aber keine Live-Vorschau (betroffene Einheiten, Spezifität,
          Konflikte) — die Vorschau-API erfordert mindestens die Rolle Editor.
        </p>
      )}

      {canPreview && previewError && <p role="alert">{previewError}</p>}
      {canPreview && preview && <ConflictBanner conflicts={preview.conflicts} />}

      {canPreview && preview && (
        <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <Badge tone={preview.canPublish ? "success" : "warning"}>
            {preview.canPublish ? "Veröffentlichung derzeit möglich" : "Veröffentlichung derzeit nicht möglich"}
          </Badge>
          <span>
            Gesamt betroffene Einheiten: <strong>{preview.totalAffectedUnitsCount}</strong>
          </span>
          <Button size="sm" variant="ghost" onClick={reloadPreview} disabled={previewLoading}>
            {previewLoading ? "Aktualisiere…" : "Vorschau aktualisieren"}
          </Button>
        </div>
      )}
      {canPreview && preview && preview.sampleSerials.length > 0 && (
        <p style={{ marginTop: "-0.5rem", marginBottom: "1rem", color: "var(--color-text-secondary, #666)" }}>
          Beispiel-Seriennummern: {preview.sampleSerials.join(", ")}
        </p>
      )}
      {canPreview && previewLoading && !preview && <Spinner size={24} />}

      {rules.length === 0 && <p>Keine Anwendbarkeitsregeln für diese Revision.</p>}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {rules.map((rule) => {
          const rp = previewByRuleId.get(rule.id);
          const hasConflict = preview?.conflicts.some((c) => c.newRuleId === rule.id) ?? false;
          return (
            <li
              key={rule.id}
              style={{
                border: `1px solid ${hasConflict ? "var(--color-danger, #d92d20)" : "var(--color-border, #ddd)"}`,
                borderRadius: 8,
                padding: "0.75rem 1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
              }}
            >
              <div>
                <p style={{ margin: "0 0 0.375rem" }}>{rp ? rp.description : fallbackDescription(rule)}</p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {rp && <Badge tone="info">Spezifität {rp.specificity}</Badge>}
                  {rp && <Badge tone="neutral">{rp.affectedUnitsCount} Einheiten betroffen</Badge>}
                  {hasConflict && <Badge tone="danger">Konflikt</Badge>}
                  {!rp && canPreview && <Badge tone="neutral">Vorschau ausstehend</Badge>}
                </div>
              </div>
              {canWrite && (
                <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingRule(rule);
                      setDrawerOpen(true);
                    }}
                  >
                    Bearbeiten
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteTarget(rule)}>
                    Löschen
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <RuleFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        revisionId={revisionId}
        editingRule={editingRule}
        onSaved={reloadAll}
      />

      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Regel löschen">
        <div style={{ minWidth: "20rem" }}>
          <p>
            Soll diese Anwendbarkeitsregel wirklich gelöscht werden?
            {deleteTarget && (
              <>
                <br />
                <em>{previewByRuleId.get(deleteTarget.id)?.description ?? fallbackDescription(deleteTarget)}</em>
              </>
            )}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Löschen…" : "Löschen"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
