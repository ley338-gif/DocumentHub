import { create } from "zustand";
import { apiRequest } from "../../lib/api-client";
import { ApiError } from "../../lib/api-error";
import type { AuthUser, LoginResponse, Organization } from "../../lib/api-types";
import { getStoredOrganizationId, getStoredToken, setStoredOrganizationId, setStoredToken } from "../../lib/session-storage";

interface RegisteredUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
}

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  organizations: Organization[];
  currentOrganizationId: string | null;
  status: AuthStatus;
  error: string | null;

  /** Restores a session from a token already in localStorage (e.g. after a
   * page refresh). Safe to call multiple times. */
  bootstrap: () => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  createOrganization: (name: string) => Promise<void>;
  logout: () => void;
  switchOrganization: (organizationId: string) => void;
  /** Adopts a session issued outside login()/register() — used by the
   * invitation-accept flow when a brand-new account is created inline. */
  setSession: (accessToken: string, user: AuthUser) => Promise<void>;
  /** Re-fetches the organization list (e.g. after accepting an invitation
   * into an org the store doesn't know about yet) and optionally switches
   * to one specific org once it appears. */
  refreshOrganizations: (switchToOrganizationId?: string) => Promise<void>;
}

async function loadOrganizations(): Promise<Organization[]> {
  return apiRequest<Organization[]>("/api/organizations");
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: getStoredToken(),
  organizations: [],
  currentOrganizationId: getStoredOrganizationId(),
  status: "idle",
  error: null,

  bootstrap: async () => {
    const token = getStoredToken();
    if (!token) {
      set({ status: "unauthenticated" });
      return;
    }
    set({ status: "loading", token });
    try {
      const [user, organizations] = await Promise.all([
        apiRequest<AuthUser>("/api/auth/me"),
        loadOrganizations(),
      ]);
      const storedOrgId = getStoredOrganizationId();
      const currentOrganizationId =
        storedOrgId && organizations.some((o) => o.id === storedOrgId)
          ? storedOrgId
          : (organizations[0]?.id ?? null);
      setStoredOrganizationId(currentOrganizationId);
      set({ user, organizations, currentOrganizationId, status: "authenticated", error: null });
    } catch {
      setStoredToken(null);
      setStoredOrganizationId(null);
      set({ user: null, token: null, organizations: [], currentOrganizationId: null, status: "unauthenticated" });
    }
  },

  register: async (email: string, password: string, fullName: string) => {
    set({ status: "loading", error: null });
    try {
      await apiRequest<RegisteredUser>("/api/auth/register", {
        method: "POST",
        body: { email, password, fullName },
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.userMessage : "Registrierung fehlgeschlagen.";
      set({ status: "unauthenticated", error: message });
      throw err;
    }
    await get().login(email, password);
  },

  login: async (email: string, password: string) => {
    set({ status: "loading", error: null });
    try {
      const { accessToken, user } = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setStoredToken(accessToken);
      set({ token: accessToken, user });

      const organizations = await loadOrganizations();
      const currentOrganizationId = organizations[0]?.id ?? null;
      setStoredOrganizationId(currentOrganizationId);
      set({ organizations, currentOrganizationId, status: "authenticated", error: null });
    } catch (err) {
      const message = err instanceof ApiError ? err.userMessage : "Anmeldung fehlgeschlagen.";
      set({ status: "unauthenticated", error: message });
      throw err;
    }
  },

  createOrganization: async (name: string) => {
    try {
      const organization = await apiRequest<Organization>("/api/organizations", {
        method: "POST",
        body: { name },
      });
      const organizations = await loadOrganizations();
      setStoredOrganizationId(organization.id);
      set({ organizations, currentOrganizationId: organization.id, error: null });
    } catch (err) {
      const message = err instanceof ApiError ? err.userMessage : "Organisation konnte nicht erstellt werden.";
      set({ error: message });
      throw err;
    }
  },

  logout: () => {
    setStoredToken(null);
    setStoredOrganizationId(null);
    set({
      user: null,
      token: null,
      organizations: [],
      currentOrganizationId: null,
      status: "unauthenticated",
      error: null,
    });
  },

  switchOrganization: (organizationId: string) => {
    if (!get().organizations.some((o) => o.id === organizationId)) return;
    setStoredOrganizationId(organizationId);
    set({ currentOrganizationId: organizationId });
  },

  setSession: async (accessToken: string, user: AuthUser) => {
    setStoredToken(accessToken);
    set({ token: accessToken, user });
    const organizations = await loadOrganizations();
    const currentOrganizationId = organizations[0]?.id ?? null;
    setStoredOrganizationId(currentOrganizationId);
    set({ organizations, currentOrganizationId, status: "authenticated", error: null });
  },

  refreshOrganizations: async (switchToOrganizationId?: string) => {
    const organizations = await loadOrganizations();
    const currentOrganizationId =
      switchToOrganizationId && organizations.some((o) => o.id === switchToOrganizationId)
        ? switchToOrganizationId
        : (get().currentOrganizationId ?? organizations[0]?.id ?? null);
    setStoredOrganizationId(currentOrganizationId);
    set({ organizations, currentOrganizationId });
  },
}));
