import { Navigate, Outlet } from "react-router-dom";
import { Spinner } from "../../design-system";
import { useAuthStore } from "../auth/auth-store";

/** Client-side convenience gate only — the real enforcement is
 * PlatformAdminGuard on every /api/platform/* request. This just avoids
 * flashing platform chrome at a user the API would reject anyway. */
export function RequirePlatformAdmin() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  if (status === "idle" || status === "loading") {
    return <Spinner centered size={32} />;
  }
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }
  if (user?.platformRole !== "PLATFORM_ADMIN") {
    return <Navigate to="/app" replace />;
  }
  return <Outlet />;
}
