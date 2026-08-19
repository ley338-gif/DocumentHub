import { useState } from "react";
import { Button, Dialog, Input, Table, type TableColumn, useToast } from "../../design-system";
import type { Batch } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { createBatch, updateBatch } from "./api";

export interface ManageBatchesDialogProps {
  open: boolean;
  onClose: () => void;
  productId: string;
  batches: Batch[];
  onChanged: () => void;
}

export function ManageBatchesDialog({ open, onClose, productId, batches, onChanged }: ManageBatchesDialogProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [internalReference, setInternalReference] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateBatch(editingId, { name, internalReference: internalReference || undefined });
        toast.show({ message: "Charge aktualisiert.", tone: "success" });
      } else {
        await createBatch({ productId, name, internalReference: internalReference || undefined });
        toast.show({ message: "Charge angelegt.", tone: "success" });
      }
      setName("");
      setInternalReference("");
      setEditingId(null);
      onChanged();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Speichern fehlgeschlagen.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  const columns: TableColumn<Batch>[] = [
    { key: "name", header: "Name", render: (b) => b.name },
    { key: "reference", header: "Interne Referenz", render: (b) => b.internalReference ?? "–" },
    {
      key: "actions",
      header: "",
      render: (b) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditingId(b.id);
            setName(b.name);
            setInternalReference(b.internalReference ?? "");
          }}
        >
          Bearbeiten
        </Button>
      ),
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} title="Chargen verwalten">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: "28rem" }}>
        <Table columns={columns} rows={batches} rowKey={(b) => b.id} emptyMessage="Keine Chargen." />
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Interne Referenz" value={internalReference} onChange={(e) => setInternalReference(e.target.value)} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" disabled={saving || !name.trim()}>
              {editingId ? "Speichern" : "Anlegen"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingId(null);
                  setName("");
                  setInternalReference("");
                }}
              >
                Abbrechen
              </Button>
            )}
          </div>
        </form>
      </div>
    </Dialog>
  );
}
