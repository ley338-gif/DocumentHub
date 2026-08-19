import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api-client";

export type RegistrationMode = "INVITE_ONLY" | "SELF_SERVICE";

/** Public, unauthenticated — /login and /register both need this before a
 * session exists. Defaults to the safer INVITE_ONLY assumption while
 * loading, so the self-service form never flashes on a production-like
 * (INVITE_ONLY) deployment before the real value arrives. */
export function useRegistrationMode(): { mode: RegistrationMode; loading: boolean } {
  const [mode, setMode] = useState<RegistrationMode>("INVITE_ONLY");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ mode: RegistrationMode }>("/api/auth/registration-mode", { anonymous: true })
      .then((res) => {
        if (!cancelled) setMode(res.mode);
      })
      .catch(() => {
        // Stays INVITE_ONLY on failure — never accidentally reveals a
        // self-service form the backend wouldn't actually accept.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { mode, loading };
}
