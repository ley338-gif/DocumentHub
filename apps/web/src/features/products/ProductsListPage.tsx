import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, ErrorState, PageHeader, Pagination, StatusBadge, Table, type TableColumn } from "../../design-system";
import type { Product, ProductFamily } from "../../lib/api-types";
import { usePaginated } from "../../lib/use-paginated";
import { useCurrentRole } from "../auth/useCurrentRole";
import { hasRole } from "../../lib/roles";
import { listFamilies, listProducts } from "./api";
import { ManageFamiliesDialog } from "./ManageFamiliesDialog";
import { CreateProductDialog } from "./CreateProductDialog";

export function ProductsListPage() {
  const navigate = useNavigate();
  const role = useCurrentRole();
  const canWrite = hasRole(role, "EDITOR");

  const { items, total, page, pageSize, setPage, loading, error, reload } = usePaginated<Product>(
    (p, ps) => listProducts({ page: p, pageSize: ps }),
    [],
  );

  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [familiesOpen, setFamiliesOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  function reloadFamilies() {
    listFamilies({ pageSize: 100 })
      .then((res) => setFamilies(res.items))
      .catch(() => setFamilies([]));
  }

  useEffect(() => {
    reloadFamilies();
  }, [familiesOpen]);

  const familyName = (id: string | null) => families.find((f) => f.id === id)?.name ?? "–";

  const columns: TableColumn<Product>[] = [
    { key: "name", header: "Produktname", render: (p) => p.name },
    { key: "family", header: "Familie", render: (p) => familyName(p.productFamilyId) },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
    {
      key: "updatedAt",
      header: "Zuletzt geändert",
      render: (p) => new Date(p.updatedAt).toLocaleString("de-DE"),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Produkte"
        subtitle="Produkte, Varianten, Chargen und Einheiten Ihrer Organisation."
        actions={
          canWrite ? (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button variant="outline" onClick={() => setFamiliesOpen(true)}>
                Produktfamilien verwalten
              </Button>
              <Button variant="outline" onClick={() => navigate("/app/products/import")}>
                Einheiten importieren
              </Button>
              <Button onClick={() => setCreateOpen(true)}>Neues Produkt</Button>
            </div>
          ) : undefined
        }
      />

      {error && <ErrorState error={error} fallback="Produkte konnten nicht geladen werden." onRetry={reload} />}

      <Table
        columns={columns}
        rows={items}
        rowKey={(p) => p.id}
        onRowClick={(p) => navigate(`/app/products/${p.id}`)}
        emptyMessage={
          loading ? (
            "Lädt…"
          ) : (
            <EmptyState
              title="Keine Produkte vorhanden"
              description="Legen Sie Ihr erstes Produkt an, um mit der Dokumentation zu beginnen."
              action={canWrite ? <Button onClick={() => setCreateOpen(true)}>Neues Produkt</Button> : undefined}
            />
          )
        }
      />

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      <ManageFamiliesDialog
        open={familiesOpen}
        onClose={() => setFamiliesOpen(false)}
        families={families}
        onChanged={reloadFamilies}
      />
      <CreateProductDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        families={families}
        onCreated={(product) => {
          setCreateOpen(false);
          reload();
          navigate(`/app/products/${product.id}`);
        }}
      />
    </div>
  );
}
