import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchInputWithHistory, readSearchHistory } from "@/components/search-input-with-history";

const KEY = "iris:recent-searches:test";
const SEEDED = ["ashford", "voss", "chamberlain"];

/** Controlled wrapper so applying a history entry updates the input. */
function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <SearchInputWithHistory
      value={value}
      onChange={(v) => { setValue(v); onChange?.(v); }}
      historyKey={KEY}
      placeholder="Search…"
    />
  );
}

async function openDropdown(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByPlaceholderText("Search…"));
}

describe("SearchInputWithHistory recent searches", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(KEY, JSON.stringify(SEEDED));
  });

  it("renders one row per seeded entry", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openDropdown(user);

    expect(screen.getByRole("listbox").querySelectorAll("li")).toHaveLength(3);
  });

  it("removes exactly the clicked entry from localStorage and the dropdown", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openDropdown(user);

    await user.click(screen.getByRole("button", { name: "Remove recent search: voss" }));

    expect(readSearchHistory(KEY)).toEqual(["ashford", "chamberlain"]);
    expect(screen.queryByRole("button", { name: "Remove recent search: voss" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove recent search: ashford" })).toBeInTheDocument();
  });

  it("removing an entry does not run the search for it", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await openDropdown(user);

    await user.click(screen.getByRole("button", { name: "Remove recent search: voss" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("remove buttons are keyboard-activatable", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openDropdown(user);

    const remove = screen.getByRole("button", { name: "Remove recent search: ashford" });
    remove.focus();
    expect(remove).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(readSearchHistory(KEY)).toEqual(["voss", "chamberlain"]);
  });

  it("Clear all empties the history", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openDropdown(user);

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(readSearchHistory(KEY)).toEqual([]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clicking the row body still runs the search", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await openDropdown(user);

    await user.click(screen.getByRole("button", { name: "voss" }));

    expect(onChange).toHaveBeenCalledWith("voss");
    expect(screen.getByPlaceholderText("Search…")).toHaveValue("voss");
  });

  it("hides the header and dropdown when there is no history", async () => {
    localStorage.clear();
    const user = userEvent.setup();
    render(<Harness />);
    await openDropdown(user);

    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });
});
