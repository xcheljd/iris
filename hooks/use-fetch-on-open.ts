"use client";
import { useEffect, useEffectEvent, useState } from "react";

/**
 * Load data whenever a dialog opens, and again whenever `key` changes while it
 * is open (a new filter, a new scope).
 *
 * - `key` is the ONLY thing that decides when to refetch, so pass a string that
 *   names the request (e.g. `JSON.stringify(filters)`). `fetcher` and `onError`
 *   can be inline closures: they're read through useEffectEvent, never deps.
 * - A late reply from a closed dialog or an older key is ignored.
 * - A failed load clears `data`, so the dialog can never show the previous
 *   request's rows under the new request's heading.
 * - `loading` is true from the moment `key` changes until that request settles.
 */
export function useFetchOnOpen<T>(
  open: boolean,
  key: string,
  fetcher: () => Promise<T>,
  onError: (err: unknown) => void,
): { data: T | null; loading: boolean } {
  const [state, setState] = useState<{ key: string | null; data: T | null }>({ key: null, data: null });
  const runFetch = useEffectEvent(fetcher);
  const reportError = useEffectEvent(onError);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    runFetch().then(
      (data) => { if (!cancelled) setState({ key, data }); },
      (err: unknown) => {
        if (cancelled) return;
        setState({ key, data: null });
        reportError(err);
      },
    );
    return () => { cancelled = true; };
  }, [open, key]);

  return { data: state.data, loading: open && state.key !== key };
}
