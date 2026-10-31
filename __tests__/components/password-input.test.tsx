import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordInput } from "@/components/password-input";

describe("PasswordInput", () => {
  it("hides the value by default and toggles visibility", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Password" defaultValue="secret" />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });

  it("toggle is a type=button so it never submits the form", () => {
    render(<PasswordInput aria-label="Password" />);
    expect(screen.getByRole("button", { name: "Show password" })).toHaveAttribute("type", "button");
  });

  it("toggle carries the shared focus-visible ring", () => {
    render(<PasswordInput aria-label="Password" />);
    expect(screen.getByRole("button", { name: "Show password" }).className).toMatch(/focus-visible:ring-\[3px\]/);
  });

  it("is keyboard reachable after the field", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Password" />);
    await user.tab();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
  });

  it("passes aria-invalid and wrapperClassName through", () => {
    render(<PasswordInput aria-label="Password" aria-invalid wrapperClassName="border-success" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.closest('[data-slot="input-group"]')?.className).toContain("border-success");
  });
});
