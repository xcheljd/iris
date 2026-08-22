import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOptimisticToggle } from "@/hooks/use-optimistic";

type ActionResult = { error: string } | undefined;

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
