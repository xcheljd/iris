import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  NavigationTransitionProvider,
  useNavigationTransition,
} from "@/components/navigation-transition";
import { usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/clients") }));

function Probe() {
  const { state } = useNavigationTransition();
  return <div data-testid="state">{state}</div>;
}

function renderProvider() {
  return render(
    <NavigationTransitionProvider>
      <Probe />
    </NavigationTransitionProvider>
  );
}

function state() {
  return screen.getByTestId("state").textContent;
}

function clickAnchor(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement("a");
  a.href = href;
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.appendChild(a);
  fireEvent.click(a);
  a.remove();
}

// Bubble-phase so the provider's capture listener still sees the click,
// but jsdom never attempts the navigation.
const preventNavigation = (e: MouseEvent) => e.preventDefault();

describe("NavigationTransitionProvider", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/clients");
    document.addEventListener("click", preventNavigation);
  });

  afterEach(() => {
    document.removeEventListener("click", preventNavigation);
    vi.useRealTimers();
  });

  it("stays idle for a blob: download anchor appended to the body (CSV export)", () => {
    renderProvider();
    clickAnchor(`blob:${window.location.origin}/0f1e2d3c`, { download: "clients.csv" });
    expect(state()).toBe("idle");
  });

  it("stays idle for a same-path link that only changes the query string", () => {
    renderProvider();
    clickAnchor("/clients?filter=hot");
    expect(state()).toBe("idle");
  });

  it("enters navigating for an internal link to another path", () => {
    renderProvider();
    clickAnchor("/promos");
    expect(state()).toBe("navigating");
  });

  it("resets to idle when the pathname changes", () => {
    const { rerender } = renderProvider();
    clickAnchor("/promos");
    expect(state()).toBe("navigating");

    vi.mocked(usePathname).mockReturnValue("/promos");
    rerender(
      <NavigationTransitionProvider>
        <Probe />
      </NavigationTransitionProvider>
    );
    expect(state()).toBe("idle");
  });

  it("falls back to idle after the failsafe timeout if the pathname never changes", () => {
    vi.useFakeTimers();
    renderProvider();
    clickAnchor("/promos");
    expect(state()).toBe("navigating");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(state()).toBe("idle");
  });
});
