import { useEffect, useState } from "react";
import { Button, Dialog, EmptyState, ErrorState, Input, Pagination, Select, Spinner, StatusBadge, Table, type TableColumn, useToast } from "../../../design-system";
import type { Batch, ProductVariant, Unit } from "../../../lib/api-types";
import { usePaginated } from "../../../lib/use-paginated";
import { createUnit, fetchQrImageUrl, listBatches, listUnits, listVariants } from "../api";
import { ManageBatchesDialog } from "../ManageBatchesDialog";
import { ApiError } from "../../../lib/api-error";

export interface UnitsTabProps {
  productId: string;
  canWrite: boolean;
}

export function UnitsTab({ productId, canWrite }: UnitsTabProps) {
  const { items, total, page, pageSize, setPage, loading, reload } = usePaginated<Unit>(
    (p, ps) => listUnits({ productId, page: p, pageSize: ps }),
    [productId],
  );

  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [qrUnit, setQrUnit] = useState<Unit | null>(null);

  function reloadRefs() {
    listVariants(productId, { pageSize: 100 }).then((r) => setVariants(r.items)).catch(() => setVariants([]));
    listBatches({ productId, pageSize: 100 }).then((r) => setBatches(r.items)).catch(() => setBatches([]));
  }

  useEffect(() => {
    reloadRefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, batchesOpen]);

  const variantName = (id: string | null) => variants.find((v) => v.id === id)?.name ?? "–";
  const batchName = (id: string | null) => batches.find((b) => b.id === id)?.name ?? "–";

  const columns: TableColumn<Unit>[] = [
    { key: "serial", header: "Seriennummer", render: (u) => u.serialNumber },
    { key: "variant", header: "Variante", render: (u) => variantName(u.variantId) },
    { key: "batch", header: "Charge", render: (u) => batchName(u.batchId) },
    { key: "status", header: "Status", render: (u) => <StatusBadge status={u.status} /> },
    {
      key: "qr",
      header: "Öffentlicher Zugriff",
      render: (u) => (
        <Button variant="outline" size="sm" onClick={() => setQrUnit(u)}>
          QR-Code
        </Button>
      ),
    },
  ];

  return (
    <div>
      {canWrite && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
          <Button variant="outline" onClick={() => setBatchesOpen(true)}>
            Chargen verwalten
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Neue Einheit</Button>
        </div>
      )}
      <Table
        columns={columns}
        rows={items}
        rowKey={(u) => u.id}
        emptyMessage={
          loading ? (
            "Lädt…"
          ) : (
            <EmptyState
              title="Keine Einheiten vorhanden"
              description="Legen Sie eine Einheit an oder importieren Sie Einheiten über die CSV-Import-Funktion."
              action={canWrite ? <Button onClick={() => setCreateOpen(true)}>Neue Einheit</Button> : undefined}
            />
          )
        }
      />
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      <ManageBatchesDialog
        open={batchesOpen}
        onClose={() => setBatchesOpen(false)}
        productId={productId}
        batches={batches}
        onChanged={reloadRefs}
      />

      <CreateUnitDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        productId={productId}
        variants={variants}
        batches={batches}
        onCreated={() => {
          setCreateOpen(false);
          reload();
        }}
      />

      <UnitQrDialog unit={qrUnit} onClose={() => setQrUnit(null)} />
    </div>
  );
}

function UnitQrDialog({ unit, onClose }: { unit: Unit | null; onClose: () => void }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const publicUrl = unit ? `${window.location.origin}/u/${unit.stableId}` : "";

  useEffect(() => {
    if (!unit) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setQrUrl(null);
    setError(null);
    fetchQrImageUrl("units", unit.id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setQrUrl(url);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "QR-Code konnte nicht geladen werden."));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [unit]);

  return (
    <Dialog open={!!unit} onClose={onClose} title={unit ? `QR-Code — ${unit.serialNumber}` : "QR-Code"}>
      {unit && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: "20rem" }}>
          <div>
            <span style={{ fontWeight: 600 }}>Öffentliche URL: </span>
            <a href={publicUrl} target="_blank" rel="noreferrer">
              {publicUrl}
            </a>
          </div>
          {error && <ErrorState error={error} fallback="QR-Code konnte nicht geladen werden." />}
          {!qrUrl && !error && <Spinner />}
          {qrUrl && <img src={qrUrl} alt={`QR-Code für Einheit ${unit.serialNumber}`} width={200} height={200} />}
        </div>
      )}
    </Dialog>
  );
}

function CreateUnitDialog({
  open,
  onClose,
  productId,
  variants,
  batches,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  variants: ProductVariant[];
  batches: Batch[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [serialNumber, setSerialNumber] = useState("");
  const [variantId, setVariantId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setSerialNumber("");
    setVariantId("");
    setBatchId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serialNumber.trim()) return;
    setSaving(true);
    try {
      await createUnit({
        productId,
        serialNumber,
        variantId: variantId || undefined,
        batchId: batchId || undefined,
      });
      toast.show({ message: "Einheit angelegt.", tone: "success" });
      reset();
      onCreated();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Anlegen fehlgeschlagen.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Neue Einheit">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: "24rem" }}>
        <Input label="Seriennummer" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} required autoFocus />
        <Select
          label="Variante"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          options={[{ value: "", label: "Keine" }, ...variants.map((v) => ({ value: v.id, label: v.name }))]}
        />
        <Select
          label="Charge"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          options={[{ value: "", label: "Keine" }, ...batches.map((b) => ({ value: b.id, label: b.name }))]}
        />
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving || !serialNumber.trim()}>
            Anlegen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
