import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOptimisticToggle, useRemovedKeys } from "@/hooks/use-optimistic";

type ActionResult = { error: string } | undefined;

interface RemovedKeyItem {
  id: string;
  name: string;
}

const removedKeyItems: RemovedKeyItem[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
];

/** Deferred promise helper: lets us hold the action mid-flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useOptimisticToggle", () => {
  it("1. returns the server value initially (no override)", () => {
    const action = vi.fn<() => Promise<ActionResult>>(async () => undefined);
    const { result } = renderHook(() => useOptimisticToggle(true, action));
    expect(result.current.value).toBe(true);
    expect(result.current.isPending).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("2. toggle() flips the displayed value on next render, before the action settles", async () => {
    const d = deferred<ActionResult>();
    const action = vi.fn(() => d.promise);
    const { result } = renderHook(() => useOptimisticToggle(false, action));

    act(() => {
      void result.current.toggle();
    });

    // No await of the action yet — flip must already be visible.
    expect(result.current.value).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve(undefined);
      await d.promise.catch(() => {});
    });
    // Success: override held (server prop still false).
    expect(result.current.value).toBe(true);
  });

  it("3. action resolving { error } reverts the display to the server value and returns the error", async () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({ error: "boom" }));
    const { result } = renderHook(() => useOptimisticToggle(false, action));

    let p: Promise<ActionResult> | undefined;
    act(() => {
      p = result.current.toggle();
    });
    expect(result.current.value).toBe(true);

    let returned: ActionResult;
    await act(async () => {
      returned = await p!;
    });
    expect(result.current.value).toBe(false); // reverted to server value
    expect(returned!).toEqual({ error: "boom" });
  });

  it("4. action throwing reverts the display and returns { error }", async () => {
    const action = vi.fn(async () => {
      throw new Error("network down");
    });
    const { result } = renderHook(() => useOptimisticToggle(true, action));

    let p: Promise<ActionResult> | undefined;
    act(() => {
      p = result.current.toggle();
    });
    expect(result.current.value).toBe(false);

    let returned: ActionResult;
    await act(async () => {
      returned = await p!;
    });
    expect(result.current.value).toBe(true); // reverted
    expect(returned!).toEqual({ error: "network down" });
  });

  it("5. successful action holds the override even while the server prop is unchanged", async () => {
    const action = vi.fn(async (): Promise<ActionResult> => undefined);
    const { result, rerender } = renderHook(
      ({ serverValue }: { serverValue: boolean }) =>
        useOptimisticToggle(serverValue, action),
      { initialProps: { serverValue: false } }
    );

    let p: Promise<ActionResult> | undefined;
    act(() => {
      p = result.current.toggle();
    });
    await act(async () => {
      await p;
    });
    expect(result.current.value).toBe(true);

    // Server prop has not caught up yet; extra renders must NOT flip back.
    rerender({ serverValue: false });
    rerender({ serverValue: false });
    expect(result.current.value).toBe(true);
  });

  it("6. once the server prop agrees with the override, the override clears cleanly", async () => {
    const action = vi.fn(async (): Promise<ActionResult> => undefined);
    const { result, rerender } = renderHook(
      ({ serverValue }: { serverValue: boolean }) =>
        useOptimisticToggle(serverValue, action),
      { initialProps: { serverValue: false } }
    );

    let p: Promise<ActionResult> | undefined;
    act(() => {
      p = result.current.toggle();
    });
    await act(async () => {
      await p;
    });
    expect(result.current.value).toBe(true);

    // Revalidated props land: server now agrees.
    rerender({ serverValue: true });
    expect(result.current.value).toBe(true);

    // And further renders keep it stable at true (override dropped, no flash).
    rerender({ serverValue: true });
    expect(result.current.value).toBe(true);
  });

  it("7. isPending is true between toggle and settle; a second toggle while pending is ignored", async () => {
    const d = deferred<ActionResult>();
    const action = vi.fn(() => d.promise);
    const { result } = renderHook(() => useOptimisticToggle(false, action));

    expect(result.current.isPending).toBe(false);
    let first: Promise<ActionResult>;
    act(() => {
      first = result.current.toggle();
    });
    expect(result.current.isPending).toBe(true);

    // Second toggle while in flight: ignored, no extra action call.
    let second: ActionResult;
    await act(async () => {
      second = await result.current.toggle();
    });
    expect(second).toEqual({ error: "Pending" });
    expect(action).toHaveBeenCalledTimes(1);
    // Display unchanged by the ignored second toggle.
    expect(result.current.value).toBe(true);

    await act(async () => {
      d.resolve(undefined);
      await first;
    });
    expect(result.current.isPending).toBe(false);
    expect(result.current.value).toBe(true);
  });
});

// ─── useRemovedKeys ──────────────────────────────────────────────────────────

describe("useRemovedKeys", () => {
  it("1. isRemoved(key) is false initially", () => {
    const action = vi.fn(async (): Promise<ActionResult> => undefined);
    const { result } = renderHook(() =>
      useRemovedKeys(removedKeyItems, (i) => i.id)
    );
    expect(result.current.isRemoved("a")).toBe(false);
    expect(result.current.isRemoved("b")).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("2. remove(key, action) marks the key removed on next render, before the action settles", async () => {
    const d = deferred<ActionResult>();
    const action = vi.fn(() => d.promise);
    const { result } = renderHook(() =>
      useRemovedKeys(removedKeyItems, (i) => i.id)
    );

    act(() => {
      void result.current.remove("a", action);
    });

    // No await of the action yet — removal must already be visible.
    expect(result.current.isRemoved("a")).toBe(true);
    expect(result.current.isRemoved("b")).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve(undefined);
      await d.promise.catch(() => {});
    });
    expect(result.current.isRemoved("a")).toBe(true); // held until props agree
  });

  it("3. a rejecting/thrown action rolls back — key is visible again and { error } is returned", async () => {
    const action = vi.fn(async (): Promise<ActionResult> => {
      throw new Error("unban failed");
    });
    const { result } = renderHook(() =>
      useRemovedKeys(removedKeyItems, (i) => i.id)
    );

    let p: Promise<ActionResult> | undefined;
    act(() => {
      p = result.current.remove("a", action);
    });
    expect(result.current.isRemoved("a")).toBe(true);

    let returned: ActionResult;
    await act(async () => {
      returned = await p!;
    });
    expect(result.current.isRemoved("a")).toBe(false); // rollback
    expect(returned!).toEqual({ error: "unban failed" });
  });

  it("4. success + base list re-rendered without the key drops the override entry (no leak)", async () => {
    const action = vi.fn(async (): Promise<ActionResult> => undefined);
    const { result, rerender } = renderHook(
      ({ list }: { list: RemovedKeyItem[] }) =>
        useRemovedKeys(list, (i) => i.id),
      { initialProps: { list: removedKeyItems } }
    );

    let p: Promise<ActionResult> | undefined;
    act(() => {
      p = result.current.remove("a", action);
    });
    await act(async () => {
      await p;
    });
    expect(result.current.isRemoved("a")).toBe(true);

    // Revalidated props land: server list no longer contains "a".
    rerender({ list: [removedKeyItems[1]] });
    // The override entry was reconciled away — hook state has no leak.
    expect(result.current.isRemoved("a")).toBe(false);

    // And if the key ever comes back (e.g. undo/re-add), it must NOT be
    // pre-marked as removed by stale state.
    rerender({ list: removedKeyItems });
    expect(result.current.isRemoved("a")).toBe(false);
  });

  it("5. unmark(key) restores an optimistically-removed key", async () => {
    const action = vi.fn(async (): Promise<ActionResult> => undefined);
    const { result } = renderHook(() =>
      useRemovedKeys(removedKeyItems, (i) => i.id)
    );

    let p: Promise<ActionResult> | undefined;
    act(() => {
      p = result.current.remove("a", action);
    });
    await act(async () => {
      await p;
    });
    expect(result.current.isRemoved("a")).toBe(true);

    act(() => {
      result.current.unmark("a");
    });
    expect(result.current.isRemoved("a")).toBe(false);
  });
});
