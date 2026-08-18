import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { RouteFade } from "@/components/route-fade";
import { usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/clients") }));

// Counts MOUNTS (not renders) across rerenders — the fade re-runs precisely
// when the keyed wrapper remounts its children; re-renders don't count.
function MountCounter({ bag }: { bag: { n: number } }) {
  useEffect(() => {
    bag.n += 1;
  }, []);
  return <div data-testid="child">content</div>;
}

describe("RouteFade", () => {
  it("renders children inside the fade wrapper with animation, motion-reduce, and flex-chain classes", () => {
    render(
      <RouteFade>
        <div data-testid="child">content</div>
      </RouteFade>
    );
    const wrapper = screen.getByTestId("child").parentElement;
    expect(wrapper?.className).toContain("animate-in");
    expect(wrapper?.className).toContain("fade-in");
    expect(wrapper?.className).toContain("motion-reduce:animate-none");
    // Preserves SidebarInset's flex column so page roots keep filling the viewport
    expect(wrapper?.className).toContain("flex");
    expect(wrapper?.className).toContain("flex-1");
    expect(wrapper?.className).toContain("min-h-0");
  });

  it("re-keys on pathname change so children remount and the fade re-runs", () => {
    const bag = { n: 0 };
    vi.mocked(usePathname).mockReturnValue("/clients");
    const { rerender } = render(
      <RouteFade>
        <MountCounter bag={bag} />
      </RouteFade>
    );
    expect(bag.n).toBe(1);

    vi.mocked(usePathname).mockReturnValue("/follow-ups");
    rerender(
      <RouteFade>
        <MountCounter bag={bag} />
      </RouteFade>
    );
    expect(bag.n).toBe(2);
  });

  it("does NOT remount children when only searchParams change on the same route", () => {
    const bag = { n: 0 };
    vi.mocked(usePathname).mockReturnValue("/clients");
    const { rerender } = render(
      <RouteFade>
        <MountCounter bag={bag} />
      </RouteFade>
    );
    expect(bag.n).toBe(1);

    // Same pathname, new children render (e.g. ?page=2 navigation) — no remount
    rerender(
      <RouteFade>
        <MountCounter bag={bag} />
      </RouteFade>
    );
    expect(bag.n).toBe(1);
  });
});
