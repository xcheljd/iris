import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagPicker } from "@/components/tag-picker";

const options = [{ name: "VIP", usageCount: 5 }, { name: "collector", usageCount: 2 }];

async function open(props: Partial<React.ComponentProps<typeof TagPicker>> = {}) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(<TagPicker value={[]} options={options} onAdd={onAdd} onRemove={onRemove} {...props} />);
  await user.click(screen.getByRole("button", { name: /Add a tag/ }));
  return { user, onAdd, onRemove, input: screen.getByPlaceholderText("Search or create a tag…") };
}

describe("TagPicker", () => {
  it("picks an existing tag", async () => {
    const { user, onAdd } = await open();
    await user.click(screen.getByText("collector"));
    expect(onAdd).toHaveBeenCalledWith("collector");
  });

  it("typing another capitalisation picks the existing tag, with no Create row", async () => {
    const { user, input } = await open();
    await user.type(input, "vip");
    expect(screen.queryByText(/Create/)).not.toBeInTheDocument();
  });

  it("offers Create for a new name", async () => {
    const { user, onAdd, input } = await open();
    await user.type(input, "Gift buyer");
    await user.click(screen.getByText(/Create/));
    expect(onAdd).toHaveBeenCalledWith("Gift buyer");
  });

  it("has no Create row when creating is off", async () => {
    const { user, input } = await open({ creatable: false });
    await user.type(input, "Gift buyer");
    expect(screen.queryByText(/Create/)).not.toBeInTheDocument();
  });

  it("picking a chosen tag again removes it", async () => {
    const { user, onRemove } = await open({ value: ["VIP"] });
    await user.click(screen.getByRole("option", { name: /VIP/ }));
    expect(onRemove).toHaveBeenCalledWith("VIP");
  });

  it("each chosen tag has a keyboard-reachable remove button", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<TagPicker value={["VIP"]} options={options} onAdd={vi.fn()} onRemove={onRemove} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Remove tag VIP" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledWith("VIP");
  });
});
