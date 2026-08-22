"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OptimisticActionResult = { error: string } | undefined;

/**
 * React-18-compatible optimistic boolean toggle (no native `useOptimistic`).
 *
 * Flips the displayed value instantly, fires `action`, then:
 * - error (`{ error }` return or throw) → rollback to the server value;
 * - success → hold the override until the revalidated server prop agrees,
 *   then drop it (prevents flash-back before props land).
 */
export function useOptimisticToggle(
  serverValue: boolean,
  action: () => Promise<OptimisticActionResult>
) {
  const [override, setOverride] = useState<boolean | null>(null);
  const [isPending, setPending] = useState(false);
  const inFlight = useRef(false);
  const value = override ?? serverValue;

  // Drop override once the server prop agrees with it (revalidated props landed).
  useEffect(() => {
    if (override !== null && serverValue === override) setOverride(null);
  }, [serverValue, override]);

  const toggle = useCallback(async (): Promise<OptimisticActionResult> => {
    if (inFlight.current) return { error: "Pending" };
    inFlight.current = true;
    const next = !(override ?? serverValue);
    setOverride(next);
    setPending(true);
    try {
      const res = await action();
      if (res?.error) {
        setOverride(null); // rollback
        return res;
      }
      return res; // override held until server prop catches up (effect above)
    } catch (err) {
      setOverride(null); // rollback
      return { error: err instanceof Error ? err.message : "Request failed" };
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [action, override, serverValue]);

  return { value, toggle, isPending } as const;
}
