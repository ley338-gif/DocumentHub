import { useState } from "react";
import { Button, Dialog, Input, Select, useToast } from "../../design-system";
import type { Product, ProductFamily } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { createProduct } from "./api";

export interface CreateProductDialogProps {
  open: boolean;
  onClose: () => void;
  families: ProductFamily[];
  onCreated: (product: Product) => void;
}

export function CreateProductDialog({ open, onClose, families, onCreated }: CreateProductDialogProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [modelDesignation, setModelDesignation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setFamilyId("");
    setModelDesignation("");
    setDescription("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const product = await createProduct({
        name,
        productFamilyId: familyId || undefined,
        modelDesignation: modelDesignation || undefined,
        description: description || undefined,
      });
      toast.show({ message: "Produkt angelegt.", tone: "success" });
      reset();
      onCreated(product);
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Anlegen fehlgeschlagen.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Neues Produkt">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: "24rem" }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Select
          label="Produktfamilie"
          value={familyId}
          onChange={(e) => setFamilyId(e.target.value)}
          options={[{ value: "", label: "Keine" }, ...families.map((f) => ({ value: f.id, label: f.name }))]}
        />
        <Input label="Modellbezeichnung" value={modelDesignation} onChange={(e) => setModelDesignation(e.target.value)} />
        <Input label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            Anlegen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
