import { useAuthStore } from "./auth-store";

/** The current user's role within the currently selected organization, or
 * undefined if not resolvable yet (e.g. still bootstrapping). */
export function useCurrentRole(): string | undefined {
  const organizations = useAuthStore((s) => s.organizations);
  const currentOrganizationId = useAuthStore((s) => s.currentOrganizationId);
  return organizations.find((o) => o.id === currentOrganizationId)?.role;
}
