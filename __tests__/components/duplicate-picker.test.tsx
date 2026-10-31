import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DuplicatePicker, unpicked, SKIP, type DupGroup, type DupShortcut } from "@/components/import/duplicate-picker";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

const GROUPS: DupGroup[] = [
  { key: "AD-8404", label: "AD-8404", canSkip: true, copies: [
    { id: "20%#5", title: "20% sheet · row 5", fields: [{ label: "MSRP", value: "$500.00" }, { label: "Off", value: "20%" }] },
    { id: "30%#3", title: "30% sheet · row 3", fields: [{ label: "MSRP", value: "$500.00" }, { label: "Off", value: "30%" }] },
  ] },
  { key: "VL-525", label: "VL-525", canSkip: false, copies: [
    { id: "existing:1", title: "In Iris now", fields: [{ label: "MSRP", value: "$895.00" }, { label: "Off", value: "25%" }] },
    { id: "#7", title: "Row 7", fields: [{ label: "MSRP", value: "$895.00" }, { label: "Off", value: "25%" }] },
  ] },
];
const SHORTCUTS: DupShortcut[] = [
  { id: "bigger", label: "Keep the bigger discount", pick: (g) => (g.key === "AD-8404" ? "30%#3" : null) },
];

describe("DuplicatePicker", () => {
  it("counts groups left to pick, rejecting skip where it isn't offered", () => {
    expect(unpicked(GROUPS, {}).map((g) => g.key)).toEqual(["AD-8404", "VL-525"]);
    expect(unpicked(GROUPS, { "AD-8404": SKIP, "VL-525": SKIP }).map((g) => g.key)).toEqual(["VL-525"]);
    expect(unpicked(GROUPS, { "AD-8404": "30%#3", "VL-525": "#7" })).toEqual([]);
  });

  it("dims values every copy agrees on and picks per row", () => {
    const onChange = vi.fn();
    render(<DuplicatePicker groups={GROUPS} picks={{}} onChange={onChange} shortcuts={SHORTCUTS} />);
    expect(screen.getByText(/2 left to pick/)).toBeInTheDocument();
    expect(screen.getAllByText("$500.00")[0]).toHaveClass("text-muted-foreground/60");
    expect(screen.getByText("20%")).toHaveClass("font-medium");
    expect(screen.getAllByRole("radio", { name: /skip/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("radio", { name: "AD-8404: 30% sheet · row 3" }));
    expect(onChange).toHaveBeenCalledWith({ "AD-8404": "30%#3" });
  });

  it("applies a shortcut to every group it fits", () => {
    const onChange = vi.fn();
    render(<DuplicatePicker groups={GROUPS} picks={{}} onChange={onChange} shortcuts={SHORTCUTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply to all" }));
    expect(onChange).toHaveBeenCalledWith({ "AD-8404": "30%#3" });
  });
});
