import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api-error";

export type PublicResourceState<T> =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "success"; data: T };

/** Fetches a public resource (product or unit page) and maps the outcome to
 * one of the states the page needs to distinguish: loading, a genuine
 * "not found" (backend 404 — could be a wrong/retired/foreign stableId, the
 * backend deliberately doesn't say which), a network/server error, or
 * success (which may still have an empty publications list — that's a
 * separate state the page itself renders, not this hook's concern). */
export function usePublicResource<T>(stableId: string | undefined, fetcher: (stableId: string) => Promise<T>) {
  const [state, setState] = useState<PublicResourceState<T>>({ status: "loading" });

  useEffect(() => {
    if (!stableId) {
      setState({ status: "not-found" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    fetcher(stableId)
      .then((data) => {
        if (!cancelled) setState({ status: "success", data });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "NOT_FOUND") {
          setState({ status: "not-found" });
        } else if (err instanceof ApiError) {
          setState({ status: "error", message: err.userMessage });
        } else {
          setState({ status: "error", message: "Es ist ein unerwarteter Fehler aufgetreten." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [stableId, fetcher]);

  return state;
}
