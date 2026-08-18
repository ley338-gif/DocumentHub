import { useEffect, useState } from "react";
import type { Paginated } from "./api-types";
import { ApiError } from "./api-error";

/** Generic server-paginated list state: owns page/pageSize and refetches
 * whenever the page or any of `deps` changes. Callers own any additional
 * filters (e.g. a unit's exact serialNumber match) by folding them into
 * `deps` and closing over them in `fetcher` — this hook has no built-in
 * "search" concept because not every list endpoint supports one server-side
 * (Products/Documents currently don't), and client-side filtering of a full
 * dataset would violate the paginated API contract. */
export function usePaginated<T>(
  fetcher: (page: number, pageSize: number) => Promise<Paginated<T>>,
  deps: unknown[] = [],
  pageSize = 25,
) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher(page, pageSize)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.userMessage : "Daten konnten nicht geladen werden.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, reloadToken, ...deps]);

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    page,
    pageSize,
    setPage,
    loading,
    error,
    reload: () => setReloadToken((t) => t + 1),
  };
}
