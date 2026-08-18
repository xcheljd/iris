import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileNav } from "@/components/mobile-nav";

let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

function activeClass(label: string) {
  return screen.getByText(label).closest("a")?.className ?? "";
}

describe("MobileNav active state", () => {
  it("marks Home active on exact match only", () => {
    mockPathname = "/";
    render(<MobileNav />);
    expect(activeClass("Home")).toContain("text-accent");
    expect(activeClass("Clients")).not.toContain("text-accent");
  });

  it("does not mark Home active on every route", () => {
    mockPathname = "/clients";
    render(<MobileNav />);
    expect(activeClass("Home")).not.toContain("text-accent");
    expect(activeClass("Clients")).toContain("text-accent");
  });

  it("prefix-matches a client detail route to Clients", () => {
    mockPathname = "/clients/abc-123";
    render(<MobileNav />);
    expect(activeClass("Clients")).toContain("text-accent");
  });
});
