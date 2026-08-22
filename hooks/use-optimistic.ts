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

/**
 * React-18-compatible optimistic list-removal override ("complete/unban makes
 * the row vanish"). Keys are marked removed instantly; a failed action rolls
 * the key back. On success the override entry is held until revalidated props
 * drop the key from `items`, at which point the reconcile effect clears it.
 */
export function useRemovedKeys<T>(items: T[], getKey: (item: T) => string) {
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());

  // Reconcile: keep overrides only while the item still exists in base props.
  useEffect(() => {
    setRemoved((prev) => {
      const keys = new Set(items.map(getKey));
      const kept = new Set([...prev].filter((k) => keys.has(k)));
      return kept.size === prev.size ? prev : kept;
    });
    // items is the trigger for reconciliation; getKey is stable per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const remove = useCallback(
    async (
      key: string,
      action: () => Promise<OptimisticActionResult>
    ): Promise<OptimisticActionResult> => {
      setRemoved((prev) => new Set(prev).add(key));
      try {
        const res = await action();
        if (res?.error) {
          setRemoved((prev) => {
            const nextSet = new Set(prev);
            nextSet.delete(key);
            return nextSet;
          });
          return res;
        }
        return res; // held until reconcile effect sees the key gone from props
      } catch (err) {
        setRemoved((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(key);
          return nextSet;
        });
        return { error: err instanceof Error ? err.message : "Request failed" };
      }
    },
    []
  );

  const unmark = useCallback((key: string) => {
    setRemoved((prev) => {
      const nextSet = new Set(prev);
      nextSet.delete(key);
      return nextSet;
    });
  }, []);

  const isRemoved = useCallback((key: string) => removed.has(key), [removed]);

  return { isRemoved, remove, unmark } as const;
}
