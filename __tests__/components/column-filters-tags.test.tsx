import { vi, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagsFilterMenu } from "@/components/column-filters";

// The Any/All buttons show the mode by colour only; aria-pressed carries it to
// assistive tech.
describe("TagsFilterMenu match mode", () => {
  it("marks the current mode as pressed", () => {
    const { rerender } = render(<TagsFilterMenu allTags={[]} selected={[]} mode="any" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Any" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");

    rerender(<TagsFilterMenu allTags={[]} selected={[]} mode="all" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Any" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switching mode keeps the selected tags", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TagsFilterMenu allTags={[]} selected={["vip"]} mode="any" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "All" }));

    expect(onChange).toHaveBeenCalledWith({ selected: ["vip"], mode: "all" });
  });
});
