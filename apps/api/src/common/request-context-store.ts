import { AsyncLocalStorage } from "async_hooks";

// Cross-cutting per-request context (request ID, client IP, user agent),
// readable from anywhere in the request's async call chain — including
// singleton services like AuditService/PlatformAuditService — without
// threading it through every function signature between the HTTP layer
// and those 30+ call sites. Populated once, at the very start of the
// request, by RequestContextMiddleware; never written to afterward.
export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStore.getStore();
}
