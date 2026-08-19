// Tiny localStorage wrapper for the two pieces of session state the API
// client needs on every request (token, current organization). Kept
// separate from the auth store so api-client.ts can read them without
// importing the store (which would create a cycle: store -> api client ->
// store).
const TOKEN_KEY = "document-hub.token";
const ORG_ID_KEY = "document-hub.currentOrganizationId";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getStoredOrganizationId(): string | null {
  return localStorage.getItem(ORG_ID_KEY);
}

export function setStoredOrganizationId(organizationId: string | null): void {
  if (organizationId) localStorage.setItem(ORG_ID_KEY, organizationId);
  else localStorage.removeItem(ORG_ID_KEY);
}
