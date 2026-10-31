import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EmailText } from "@/components/email-text";

describe("EmailText", () => {
  it("renders the full address with a break opportunity after the @", () => {
    const { container } = render(<EmailText email="susan.davis2@example.com" />);
    expect(container.textContent).toBe("susan.davis2@example.com");
    const wbr = container.querySelector("wbr");
    expect(wbr).not.toBeNull();
    expect(wbr?.previousSibling?.textContent).toBe("susan.davis2@");
  });

  it("renders a string without an @ as-is", () => {
    const { container } = render(<EmailText email="not-an-email" />);
    expect(container.textContent).toBe("not-an-email");
    expect(container.querySelector("wbr")).toBeNull();
  });
});
