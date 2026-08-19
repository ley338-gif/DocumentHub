import { useEffect, useState } from "react";
import { Button, Drawer, useToast } from "../../design-system";
import type { ApplicabilityRuleDto } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { createApplicabilityRule, updateApplicabilityRule } from "../documents/api";
import { EMPTY_RULE_FORM, ScopeFields, ruleFormToInput, type RuleFormState } from "./ScopeFields";

export interface RuleFormDrawerProps {
  open: boolean;
  onClose: () => void;
  revisionId: string;
  editingRule: ApplicabilityRuleDto | null;
  onSaved: () => void;
}

function ruleToFormState(rule: ApplicabilityRuleDto): RuleFormState {
  return {
    productFamilyId: rule.productFamilyId ?? "",
    productId: rule.productId ?? "",
    variantId: rule.variantId ?? "",
    batchId: rule.batchId ?? "",
    unitId: rule.unitId ?? "",
    unitSerialNumber: "",
    serialFrom: rule.serialFrom ?? "",
    serialTo: rule.serialTo ?? "",
    validFrom: rule.validFrom ? rule.validFrom.slice(0, 10) : "",
    validUntil: rule.validUntil ? rule.validUntil.slice(0, 10) : "",
    explicitExclusion: rule.explicitExclusion,
  };
}

/**
 * Create/edit form for a single applicability rule. Saving calls the real
 * POST/PATCH endpoint and shows the real backend validation error via Toast
 * on failure — there is no optimistic-only success path for something this
 * consequential (spec: this UI is a pure consumer, the backend decides
 * whether a rule is valid).
 */
export function RuleFormDrawer({ open, onClose, revisionId, editingRule, onSaved }: RuleFormDrawerProps) {
  const toast = useToast();
  const [form, setForm] = useState<RuleFormState>(EMPTY_RULE_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editingRule ? ruleToFormState(editingRule) : EMPTY_RULE_FORM);
    }
  }, [open, editingRule]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const input = ruleFormToInput(form);
      if (editingRule) {
        await updateApplicabilityRule(revisionId, editingRule.id, input);
        toast.show({ message: "Anwendbarkeitsregel aktualisiert.", tone: "success" });
      } else {
        await createApplicabilityRule(revisionId, input);
        toast.show({ message: "Anwendbarkeitsregel angelegt.", tone: "success" });
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.show({
        message: err instanceof ApiError ? err.userMessage : "Regel konnte nicht gespeichert werden.",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={editingRule ? "Regel bearbeiten" : "Regel anlegen"}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <ScopeFields value={form} onChange={setForm} />
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Speichern…" : "Speichern"}
          </Button>
        </div>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
          Nach dem Speichern aktualisiert sich die Backend-Vorschau (betroffene Einheiten, Spezifität, Konflikte)
          automatisch.
        </p>
      </form>
    </Drawer>
  );
}
