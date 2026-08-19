import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, PageHeader, Spinner, Tabs } from "../../design-system";
import type { Product, ProductFamily } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { hasRole } from "../../lib/roles";
import { useCurrentRole } from "../auth/useCurrentRole";
import { HistoryTab } from "../shared/HistoryTab";
import { getProduct, listFamilies } from "./api";
import { OverviewTab } from "./tabs/OverviewTab";
import { VariantsTab } from "./tabs/VariantsTab";
import { UnitsTab } from "./tabs/UnitsTab";
import { DocumentationTab } from "./tabs/DocumentationTab";
import { PublicAccessTab } from "./tabs/PublicAccessTab";

const TABS = [
  { key: "overview", label: "Übersicht" },
  { key: "variants", label: "Varianten" },
  { key: "units", label: "Einheiten" },
  { key: "documentation", label: "Dokumentation" },
  { key: "public", label: "Öffentlicher Zugriff" },
  { key: "history", label: "Verlauf" },
];

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useCurrentRole();
  const canWrite = hasRole(role, "EDITOR");

  const [product, setProduct] = useState<Product | null>(null);
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Supports deep-linking straight to a tab (e.g. `?tab=units` after a CSV
  // import commit, so "reload the Units view" lands the user exactly where
  // they can verify the imported units without an extra click).
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(TABS.some((t) => t.key === initialTab) ? initialTab! : "overview");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getProduct(id), listFamilies({ pageSize: 100 })])
      .then(([p, f]) => {
        if (cancelled) return;
        setProduct(p);
        setFamilies(f.items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.userMessage : "Produkt konnte nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <Spinner centered size={32} />;
  if (error || !product || !id) {
    return (
      <div>
        <p role="alert">{error ?? "Produkt nicht gefunden."}</p>
        <Button variant="secondary" onClick={() => navigate("/app/products")}>
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={product.name}
        subtitle={product.modelDesignation ?? undefined}
        actions={
          <Button variant="secondary" onClick={() => navigate("/app/products")}>
            Zurück
          </Button>
        }
      />
      <Tabs items={TABS} activeKey={activeTab} onChange={setActiveTab} />
      <div style={{ marginTop: "1.5rem" }}>
        {activeTab === "overview" && (
          <OverviewTab product={product} families={families} canWrite={canWrite} onUpdated={setProduct} />
        )}
        {activeTab === "variants" && <VariantsTab productId={id} canWrite={canWrite} />}
        {activeTab === "units" && <UnitsTab productId={id} canWrite={canWrite} />}
        {activeTab === "documentation" && <DocumentationTab productId={id} />}
        {activeTab === "public" && <PublicAccessTab product={product} />}
        {activeTab === "history" && <HistoryTab objectLabel="dieses Produkt" />}
      </div>
    </div>
  );
}
