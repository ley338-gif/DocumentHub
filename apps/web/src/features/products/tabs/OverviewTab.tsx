import { useState } from "react";
import { Button, DescriptionItem, DescriptionList, Input, Select, StatusBadge, useToast } from "../../../design-system";
import type { Product, ProductFamily } from "../../../lib/api-types";
import { ApiError } from "../../../lib/api-error";
import { updateProduct } from "../api";

export interface OverviewTabProps {
  product: Product;
  families: ProductFamily[];
  canWrite: boolean;
  onUpdated: (product: Product) => void;
}

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Entwurf" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "DISCONTINUED", label: "Eingestellt" },
];

export function OverviewTab({ product, families, canWrite, onUpdated }: OverviewTabProps) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [familyId, setFamilyId] = useState(product.productFamilyId ?? "");
  const [modelDesignation, setModelDesignation] = useState(product.modelDesignation ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [status, setStatus] = useState(product.status);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setName(product.name);
    setFamilyId(product.productFamilyId ?? "");
    setModelDesignation(product.modelDesignation ?? "");
    setDescription(product.description ?? "");
    setStatus(product.status);
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateProduct(product.id, {
        name,
        productFamilyId: familyId || undefined,
        modelDesignation: modelDesignation || undefined,
        description: description || undefined,
        status,
      });
      toast.show({ message: "Produkt aktualisiert.", tone: "success" });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Speichern fehlgeschlagen.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "32rem" }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Select
          label="Produktfamilie"
          value={familyId}
          onChange={(e) => setFamilyId(e.target.value)}
          options={[{ value: "", label: "Keine" }, ...families.map((f) => ({ value: f.id, label: f.name }))]}
        />
        <Input label="Modellbezeichnung" value={modelDesignation} onChange={(e) => setModelDesignation(e.target.value)} />
        <Input label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Product["status"])}
          options={STATUS_OPTIONS}
        />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button type="submit" disabled={saving}>
            Speichern
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Abbrechen
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <DescriptionList>
        <DescriptionItem label="Name" value={product.name} />
        <DescriptionItem label="Interne Produktnummer" value={product.internalProductNumber ?? "–"} />
        <DescriptionItem label="Modellbezeichnung" value={product.modelDesignation ?? "–"} />
        <DescriptionItem
          label="Produktfamilie"
          value={families.find((f) => f.id === product.productFamilyId)?.name ?? "–"}
        />
        <DescriptionItem label="Beschreibung" value={product.description ?? "–"} />
        <DescriptionItem label="Status" value={<StatusBadge status={product.status} />} />
      </DescriptionList>
      {canWrite && (
        <div>
          <Button variant="outline" onClick={startEdit}>
            Bearbeiten
          </Button>
        </div>
      )}
    </div>
  );
}
