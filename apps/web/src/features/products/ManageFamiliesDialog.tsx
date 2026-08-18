import { useState } from "react";
import { Button, Dialog, Input, Table, type TableColumn, useToast } from "../../design-system";
import type { ProductFamily } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { createFamily, updateFamily } from "./api";

export interface ManageFamiliesDialogProps {
  open: boolean;
  onClose: () => void;
  families: ProductFamily[];
  onChanged: () => void;
}

/** Small inline management surface for product families — not a full page,
 * per the brief ("Family and Batch management can be simple inline
 * forms/dialogs"). Refetches happen in the parent (ProductsListPage) since
 * it owns the families list. */
export function ManageFamiliesDialog({ open, onClose, families, onChanged }: ManageFamiliesDialogProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateFamily(editingId, { name, description: description || undefined });
        toast.show({ message: "Produktfamilie aktualisiert.", tone: "success" });
      } else {
        await createFamily({ name, description: description || undefined });
        toast.show({ message: "Produktfamilie angelegt.", tone: "success" });
      }
      setName("");
      setDescription("");
      setEditingId(null);
      onChanged();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Speichern fehlgeschlagen.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  const columns: TableColumn<ProductFamily>[] = [
    { key: "name", header: "Name", render: (f) => f.name },
    { key: "description", header: "Beschreibung", render: (f) => f.description ?? "–" },
    {
      key: "actions",
      header: "",
      render: (f) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditingId(f.id);
            setName(f.name);
            setDescription(f.description ?? "");
          }}
        >
          Bearbeiten
        </Button>
      ),
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} title="Produktfamilien verwalten">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: "28rem" }}>
        <Table columns={columns} rows={families} rowKey={(f) => f.id} emptyMessage="Keine Produktfamilien." />
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} />
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
                  setDescription("");
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
