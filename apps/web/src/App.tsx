import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./features/auth/RequireAuth";
import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { AppLayout } from "./features/app-shell/AppLayout";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { PublicProductPage } from "./features/public/PublicProductPage";
import { PublicUnitPage } from "./features/public/PublicUnitPage";
import { ProductsListPage } from "./features/products/ProductsListPage";
import { ProductDetailPage } from "./features/products/ProductDetailPage";
import { DocumentsListPage } from "./features/documents/DocumentsListPage";
import { DocumentDetailPage } from "./features/documents/DocumentDetailPage";
import { PublishWizardPage } from "./features/publications/PublishWizardPage";
import { PublicationHistoryPage } from "./features/publications/PublicationHistoryPage";
import { AuditLogPage } from "./features/audit/AuditLogPage";
import { ImportWizardPage } from "./features/imports/ImportWizardPage";
import { TenantUsersPage } from "./features/settings/TenantUsersPage";
import { InviteAcceptPage } from "./features/invitations/InviteAcceptPage";
import { RequirePlatformAdmin } from "./features/platform/RequirePlatformAdmin";
import { PlatformLayout } from "./features/platform/PlatformLayout";
import { PlatformDashboardPage } from "./features/platform/PlatformDashboardPage";
import { TenantsListPage } from "./features/platform/TenantsListPage";
import { TenantDetailPage } from "./features/platform/TenantDetailPage";
import { PlatformUsersPage } from "./features/platform/PlatformUsersPage";
import { PlatformAuditPage } from "./features/platform/PlatformAuditPage";
import { PlatformSystemPage } from "./features/platform/PlatformSystemPage";

export default function App() {
  return (
    <Routes>
      {/* Public QR-scan pages — no auth, no admin chrome. Mirrors the
          backend's own /p/:stableId and /u/:stableId routes 1:1. */}
      <Route path="/p/:stableId" element={<PublicProductPage />} />
      <Route path="/u/:stableId" element={<PublicUnitPage />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />

      {/* Authenticated app tree. Products, Documents, the applicability rule
          editor, the publish wizard, CSV import, Publication History, and
          the Audit UI are all real pages. Only the real dashboard KPIs
          remain a later phase. */}
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsListPage />} />
          <Route path="products/import" element={<ImportWizardPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />
          <Route path="documents" element={<DocumentsListPage />} />
          <Route path="documents/:id" element={<DocumentDetailPage />} />
          <Route path="documents/:id/publish/:revisionId" element={<PublishWizardPage />} />
          <Route path="publications" element={<PublicationHistoryPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="settings/users" element={<TenantUsersPage />} />
        </Route>
      </Route>

      {/* Platform Administration — separate shell, separate authorization
          (PlatformAdminGuard server-side), never rendered inside a tenant
          Organization context. See docs/platform-administration.md. */}
      <Route element={<RequireAuth />}>
        <Route element={<RequirePlatformAdmin />}>
          <Route path="/platform" element={<PlatformLayout />}>
            <Route index element={<PlatformDashboardPage />} />
            <Route path="tenants" element={<TenantsListPage />} />
            <Route path="tenants/:id" element={<TenantDetailPage />} />
            <Route path="users" element={<PlatformUsersPage />} />
            <Route path="audit" element={<PlatformAuditPage />} />
            <Route path="system" element={<PlatformSystemPage />} />
          </Route>
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
