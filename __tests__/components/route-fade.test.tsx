import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteFade } from "@/components/route-fade";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/clients"),
}));

describe("RouteFade", () => {
  it("renders children inside the fade wrapper", () => {
    render(
      <RouteFade>
        <div data-testid="child">content</div>
      </RouteFade>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
