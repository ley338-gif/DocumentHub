import { useEffect, useState } from "react";
import { Input, Select } from "../../design-system";
import type { Batch, Product, ProductFamily, ProductVariant } from "../../lib/api-types";
import { listBatches, listFamilies, listProducts, listVariants } from "../products/api";
import { UnitPicker } from "./UnitPicker";

export interface RuleFormState {
  productFamilyId: string;
  productId: string;
  variantId: string;
  batchId: string;
  unitId: string;
  unitSerialNumber: string; // display-only, resolved alongside unitId
  serialFrom: string;
  serialTo: string;
  validFrom: string;
  validUntil: string;
  explicitExclusion: boolean;
}

export const EMPTY_RULE_FORM: RuleFormState = {
  productFamilyId: "",
  productId: "",
  variantId: "",
  batchId: "",
  unitId: "",
  unitSerialNumber: "",
  serialFrom: "",
  serialTo: "",
  validFrom: "",
  validUntil: "",
  explicitExclusion: false,
};

const NONE = "";
const NONE_LABEL = "— keine Einschränkung —";

export interface ScopeFieldsProps {
  value: RuleFormState;
  onChange: (next: RuleFormState) => void;
}

/**
 * Pure scope-picker form fields for an applicability rule (spec §63: a rule
 * can set product family + product + variant + batch + unit + serial range
 * + validity window all at once, AND-combined). This component only lets
 * the user PICK ids from real backend data (products/variants/batches/units
 * fetched via the existing products feature API) — it does not evaluate,
 * score, or match anything. The chosen combination is only ever interpreted
 * by the backend once saved and previewed.
 */
export function ScopeFields({ value, onChange }: ScopeFieldsProps) {
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    listFamilies({ pageSize: 100 }).then((res) => setFamilies(res.items));
    listProducts({ pageSize: 100 }).then((res) => setProducts(res.items));
  }, []);

  useEffect(() => {
    if (!value.productId) {
      setVariants([]);
      setBatches([]);
      return;
    }
    listVariants(value.productId, { pageSize: 100 }).then((res) => setVariants(res.items));
    listBatches({ productId: value.productId, pageSize: 100 }).then((res) => setBatches(res.items));
  }, [value.productId]);

  // Products list has no server-side family filter — this narrows the
  // dropdown options client-side purely for picker convenience (limited to
  // whatever page of up to 100 products was fetched above). This does NOT
  // affect applicability matching/specificity/conflicts in any way; those
  // numbers always come from the backend preview.
  const visibleProducts = value.productFamilyId
    ? products.filter((p) => p.productFamilyId === value.productFamilyId)
    : products;

  function set<K extends keyof RuleFormState>(key: K, v: RuleFormState[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Select
        label="Produktfamilie"
        value={value.productFamilyId}
        onChange={(e) => set("productFamilyId", e.target.value)}
        options={[{ value: NONE, label: NONE_LABEL }, ...families.map((f) => ({ value: f.id, label: f.name }))]}
      />
      <Select
        label="Produkt"
        value={value.productId}
        onChange={(e) => {
          // Single state update — see the UnitPicker onChange comment above
          // for why chained set() calls here would lose fields.
          onChange({ ...value, productId: e.target.value, variantId: "", batchId: "" });
        }}
        options={[{ value: NONE, label: NONE_LABEL }, ...visibleProducts.map((p) => ({ value: p.id, label: p.name }))]}
      />
      <Select
        label="Variante"
        value={value.variantId}
        onChange={(e) => set("variantId", e.target.value)}
        disabled={!value.productId}
        options={[{ value: NONE, label: NONE_LABEL }, ...variants.map((v) => ({ value: v.id, label: v.name }))]}
      />
      <Select
        label="Charge"
        value={value.batchId}
        onChange={(e) => set("batchId", e.target.value)}
        disabled={!value.productId}
        options={[{ value: NONE, label: NONE_LABEL }, ...batches.map((b) => ({ value: b.id, label: b.name }))]}
      />

      <UnitPicker
        productId={value.productId || undefined}
        unitId={value.unitId}
        unitSerialNumber={value.unitSerialNumber}
        onChange={(unitId, serial) => {
          // Both fields must land in a single state update — two sequential
          // set() calls would each close over the same pre-update `value`
          // and the second would silently clobber the first.
          onChange({ ...value, unitId, unitSerialNumber: serial });
        }}
      />

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Input
          label="Seriennummer von"
          placeholder="z. B. VX-002000"
          value={value.serialFrom}
          onChange={(e) => set("serialFrom", e.target.value)}
        />
        <Input
          label="Seriennummer bis"
          placeholder="z. B. VX-003000"
          value={value.serialTo}
          onChange={(e) => set("serialTo", e.target.value)}
        />
      </div>
      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-secondary, #666)" }}>
        Rohe Zeichenketten — das Backend übernimmt Präfix-/Sequenz-Auswertung und Validierung. Es findet hier keine
        Formatprüfung außer „nicht leer“ statt.
      </p>

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Input
          label="Gültig ab"
          type="date"
          value={value.validFrom}
          onChange={(e) => set("validFrom", e.target.value)}
        />
        <Input
          label="Gültig bis"
          type="date"
          value={value.validUntil}
          onChange={(e) => set("validUntil", e.target.value)}
        />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="checkbox"
          checked={value.explicitExclusion}
          onChange={(e) => set("explicitExclusion", e.target.checked)}
        />
        Ausschluss (explizite Ausnahme)
      </label>
    </div>
  );
}

export function ruleFormToInput(value: RuleFormState) {
  return {
    productFamilyId: value.productFamilyId || undefined,
    productId: value.productId || undefined,
    variantId: value.variantId || undefined,
    batchId: value.batchId || undefined,
    unitId: value.unitId || undefined,
    serialFrom: value.serialFrom || undefined,
    serialTo: value.serialTo || undefined,
    validFrom: value.validFrom || undefined,
    validUntil: value.validUntil || undefined,
    explicitExclusion: value.explicitExclusion,
  };
}
