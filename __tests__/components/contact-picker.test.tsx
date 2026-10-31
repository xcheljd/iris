import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const isMobile = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => isMobile.value }));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

import { EmailLink, PhoneLink, phoneHref } from "@/components/contact-picker";

describe("phoneHref", () => {
  it("strips formatting to digits", () => {
    expect(phoneHref("(702) 555-0142")).toBe("7025550142");
  });
  it("keeps a leading + for international numbers", () => {
    expect(phoneHref(" +1 702-555-0142 ")).toBe("+17025550142");
  });
});

describe.each([
  ["desktop menu", false],
  ["mobile sheet", true],
])("PhoneLink (%s)", (_label, mobile) => {
  beforeEach(() => {
    isMobile.value = mobile;
    toastSuccess.mockClear();
    // vaul's drag handling calls these; jsdom doesn't implement them.
    Element.prototype.setPointerCapture ??= () => {};
    Element.prototype.releasePointerCapture ??= () => {};
  });
  afterEach(() => {
    isMobile.value = false;
  });

  it("is a tel: link that opens Call / Text / Copy instead of dialing", async () => {
    const user = userEvent.setup();
    render(<PhoneLink phone="(702) 555-0142" name="Susan Davis" />);
    const trigger = screen.getByRole("link", { name: /Phone \(702\) 555-0142/ });
    expect(trigger).toHaveAttribute("href", "tel:7025550142");
    expect(trigger).toHaveTextContent("(702) 555-0142");

    await user.click(trigger);
    const call = await screen.findByRole(mobile ? "link" : "menuitem", { name: "Call" });
    expect(call).toHaveAttribute("href", "tel:7025550142");
    expect(screen.getByRole(mobile ? "link" : "menuitem", { name: "Text" })).toHaveAttribute("href", "sms:7025550142");
  });

  it("Copy copies the number, toasts, and closes the picker", async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub; spy on it afterwards.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<PhoneLink phone="(702) 555-0142" name="Susan Davis" />);
    await user.click(screen.getByRole("link", { name: /Phone/ }));
    await user.click(await screen.findByRole(mobile ? "button" : "menuitem", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("(702) 555-0142");
    expect(toastSuccess).toHaveBeenCalledWith("Phone copied to clipboard");
    await waitFor(() => expect(screen.queryByText("Text")).toBeNull());
  });
});

describe("EmailLink", () => {
  beforeEach(() => {
    isMobile.value = false;
  });

  it("shows the full address and offers Email / Copy", async () => {
    const user = userEvent.setup();
    render(<EmailLink email="susan.davis2@example.com" />);
    const trigger = screen.getByRole("link", { name: /Email susan\.davis2@example\.com/ });
    expect(trigger).toHaveAttribute("href", "mailto:susan.davis2@example.com");
    expect(trigger).toHaveTextContent("susan.davis2@example.com");
    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "Email" })).toHaveAttribute("href", "mailto:susan.davis2@example.com");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeInTheDocument();
  });

  it("uses the bottom sheet on mobile", async () => {
    isMobile.value = true;
    const user = userEvent.setup();
    render(<EmailLink email="susan.davis2@example.com" name="Susan Davis" />);
    await user.click(screen.getByRole("link", { name: /Email susan/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Susan Davis");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
