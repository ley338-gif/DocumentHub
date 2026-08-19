import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./features/auth/RequireAuth";
import { LoginPage } from "./features/auth/LoginPage";
import { AppLayout } from "./features/app-shell/AppLayout";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { PublicProductPage } from "./features/public/PublicProductPage";
import { PublicUnitPage } from "./features/public/PublicUnitPage";
import { ProductsListPage } from "./features/products/ProductsListPage";
import { ProductDetailPage } from "./features/products/ProductDetailPage";
import { DocumentsListPage } from "./features/documents/DocumentsListPage";
import { DocumentDetailPage } from "./features/documents/DocumentDetailPage";
import { PublishWizardPage } from "./features/publications/PublishWizardPage";

export default function App() {
  return (
    <Routes>
      {/* Public QR-scan pages — no auth, no admin chrome. Mirrors the
          backend's own /p/:stableId and /u/:stableId routes 1:1. */}
      <Route path="/p/:stableId" element={<PublicProductPage />} />
      <Route path="/u/:stableId" element={<PublicUnitPage />} />

      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated app tree. Products and Documents (with revisions) are
          real pages this run — the applicability rule editor, publish
          wizard, CSV import UI, audit UI, and real dashboard KPIs are later
          phases. */}
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsListPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />
          <Route path="documents" element={<DocumentsListPage />} />
          <Route path="documents/:id" element={<DocumentDetailPage />} />
          <Route path="documents/:id/publish/:revisionId" element={<PublishWizardPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}

function NotFoundRoute() {
  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>404</h1>
      <p>Seite nicht gefunden.</p>
    </div>
  );
}
