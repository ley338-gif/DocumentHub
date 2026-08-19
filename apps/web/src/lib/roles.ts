// Mirrors apps/api/src/common/guards/roles.guard.ts's HIERARCHY. Used only
// to hide/disable actions in the UI for a nicer experience — the server is
// the actual enforcement point via @Roles()/RolesGuard on every mutating
// route, so hiding a button here is UX politeness, not security.
export type MembershipRole = "VIEWER" | "EDITOR" | "PUBLISHER" | "ADMINISTRATOR";

const HIERARCHY: Record<MembershipRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  PUBLISHER: 2,
  ADMINISTRATOR: 3,
};

export function hasRole(actual: string | undefined | null, min: MembershipRole): boolean {
  if (!actual || !(actual in HIERARCHY)) return false;
  return HIERARCHY[actual as MembershipRole] >= HIERARCHY[min];
}
