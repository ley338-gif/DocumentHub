import { useState } from "react";
import { Badge, Button, Input, Pagination, Spinner, Table, type TableColumn } from "../../design-system";
import type { Unit } from "../../lib/api-types";
import { usePaginated } from "../../lib/use-paginated";
import { listUnits } from "../products/api";

export interface UnitPickerProps {
  productId?: string;
  unitId: string;
  unitSerialNumber: string;
  onChange: (unitId: string, serialNumber: string) => void;
}

/**
 * Unit scope picker. `GET /api/units` only supports an EXACT serialNumber
 * match server-side (apps/api/src/products/products.service.ts::listUnits),
 * not a substring/prefix search — so this does not pretend to offer
 * "type-ahead contains" search, which would misrepresent the real API
 * contract. Instead: an exact-match lookup box, plus a real server-paginated
 * browse list (reusing the existing Pagination/usePaginated pattern) for
 * when the user doesn't know the exact serial number.
 */
export function UnitPicker({ productId, unitId, unitSerialNumber, onChange }: UnitPickerProps) {
  const [exactSerial, setExactSerial] = useState("");
  const [browsing, setBrowsing] = useState(false);

  const { items, total, page, pageSize, setPage, loading, error } = usePaginated<Unit>(
    (page, pageSize) => listUnits({ productId, serialNumber: exactSerial || undefined, page, pageSize }),
    [productId, exactSerial],
    10,
  );

  const columns: TableColumn<Unit>[] = [
    { key: "serial", header: "Seriennummer", render: (u) => u.serialNumber },
    { key: "status", header: "Status", render: (u) => <Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{u.status}</Badge> },
    {
      key: "pick",
      header: "",
      render: (u) => (
        <Button
          size="sm"
          variant={u.id === unitId ? "primary" : "secondary"}
          onClick={() => {
            onChange(u.id, u.serialNumber);
            setBrowsing(false);
          }}
        >
          {u.id === unitId ? "Ausgewählt" : "Wählen"}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
        Einheit (einzelne Seriennummer)
      </label>
      {unitId ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <Badge tone="info">Seriennummer {unitSerialNumber || unitId}</Badge>
          <Button size="sm" variant="ghost" onClick={() => onChange("", "")}>
            Auswahl entfernen
          </Button>
        </div>
      ) : (
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--color-text-secondary, #666)" }}>
          Keine Einheit ausgewählt (keine Einschränkung auf eine einzelne Einheit).
        </p>
      )}

      {!browsing && (
        <Button size="sm" variant="outline" type="button" onClick={() => setBrowsing(true)}>
          Einheit suchen / durchsuchen
        </Button>
      )}

      {browsing && (
        <div style={{ border: "1px solid var(--color-border, #ddd)", borderRadius: 8, padding: "0.75rem", marginTop: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "0.5rem" }}>
            <Input
              label="Exakte Seriennummer (optional)"
              placeholder="Leer lassen, um alle Einheiten zu durchsuchen"
              value={exactSerial}
              onChange={(e) => setExactSerial(e.target.value)}
            />
            <Button size="sm" variant="ghost" type="button" onClick={() => setBrowsing(false)}>
              Schließen
            </Button>
          </div>
          {loading && <Spinner size={24} />}
          {error && <p role="alert">{error}</p>}
          {!loading && !error && (
            <>
              <Table
                columns={columns}
                rows={items}
                rowKey={(u) => u.id}
                emptyMessage={
                  exactSerial
                    ? "Keine Einheit mit genau dieser Seriennummer gefunden."
                    : productId
                      ? "Keine Einheiten für dieses Produkt."
                      : "Keine Einheiten. Wählen Sie zuerst ein Produkt, um die Liste einzugrenzen."
                }
              />
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
