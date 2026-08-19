import { useState } from "react";
import { Button, Dialog, EmptyState, Input, Select, StatusBadge, Table, type TableColumn, useToast } from "../../../design-system";
import type { ProductVariant } from "../../../lib/api-types";
import { ApiError } from "../../../lib/api-error";
import { usePaginated } from "../../../lib/use-paginated";
import { createVariant, listVariants, updateVariant } from "../api";

export interface VariantsTabProps {
  productId: string;
  canWrite: boolean;
}

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Entwurf" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "DISCONTINUED", label: "Eingestellt" },
];

export function VariantsTab({ productId, canWrite }: VariantsTabProps) {
  const toast = useToast();
  const { items, loading, reload } = usePaginated<ProductVariant>(
    (p, ps) => listVariants(productId, { page: p, pageSize: ps }),
    [productId],
    100,
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductVariant | null>(null);
  const [name, setName] = useState("");
  const [internalVariantNumber, setInternalVariantNumber] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProductVariant["status"]>("ACTIVE");
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setName("");
    setInternalVariantNumber("");
    setDescription("");
    setStatus("ACTIVE");
    setDialogOpen(true);
  }

  function openEdit(variant: ProductVariant) {
    setEditing(variant);
    setName(variant.name);
    setInternalVariantNumber(variant.internalVariantNumber ?? "");
    setDescription(variant.description ?? "");
    setStatus(variant.status);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateVariant(productId, editing.id, {
          name,
          internalVariantNumber: internalVariantNumber || undefined,
          description: description || undefined,
          status,
        });
        toast.show({ message: "Variante aktualisiert.", tone: "success" });
      } else {
        await createVariant(productId, {
          name,
          internalVariantNumber: internalVariantNumber || undefined,
          description: description || undefined,
          status,
        });
        toast.show({ message: "Variante angelegt.", tone: "success" });
      }
      setDialogOpen(false);
      reload();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Speichern fehlgeschlagen.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  const columns: TableColumn<ProductVariant>[] = [
    { key: "name", header: "Name", render: (v) => v.name },
    { key: "number", header: "Interne Nummer", render: (v) => v.internalVariantNumber ?? "–" },
    { key: "status", header: "Status", render: (v) => <StatusBadge status={v.status} /> },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            render: (v: ProductVariant) => (
              <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                Bearbeiten
              </Button>
            ),
          } satisfies TableColumn<ProductVariant>,
        ]
      : []),
  ];

  return (
    <div>
      {canWrite && (
        <div style={{ marginBottom: "1rem" }}>
          <Button onClick={openCreate}>Neue Variante</Button>
        </div>
      )}
      <Table
        columns={columns}
        rows={items}
        rowKey={(v) => v.id}
        emptyMessage={
          loading ? (
            "Lädt…"
          ) : (
            <EmptyState
              title="Keine Varianten vorhanden"
              description="Legen Sie eine Variante an, um Einheiten dieses Produkts zu unterscheiden."
              action={canWrite ? <Button onClick={openCreate}>Neue Variante</Button> : undefined}
            />
          )
        }
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Variante bearbeiten" : "Neue Variante"}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: "24rem" }}>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <Input
            label="Interne Variantennummer"
            value={internalVariantNumber}
            onChange={(e) => setInternalVariantNumber(e.target.value)}
          />
          <Input label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProductVariant["status"])}
            options={STATUS_OPTIONS}
          />
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              Speichern
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
