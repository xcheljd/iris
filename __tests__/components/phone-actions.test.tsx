import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PhoneActions, phoneHref } from "@/components/phone-actions";

describe("phoneHref", () => {
  it("strips formatting to digits", () => {
    expect(phoneHref("(702) 555-0142")).toBe("7025550142");
  });
  it("keeps a leading + for international numbers", () => {
    expect(phoneHref(" +1 702-555-0142 ")).toBe("+17025550142");
  });
});

describe("PhoneActions", () => {
  it("renders call and text links with tel: and sms: hrefs", () => {
    render(
      <TooltipProvider>
        <PhoneActions phone="(702) 555-0142" />
      </TooltipProvider>,
    );
    expect(screen.getByRole("link", { name: "Call (702) 555-0142" })).toHaveAttribute("href", "tel:7025550142");
    expect(screen.getByRole("link", { name: "Text (702) 555-0142" })).toHaveAttribute("href", "sms:7025550142");
  });

  it("renders nothing for a number with no digits", () => {
    const { container } = render(
      <TooltipProvider>
        <PhoneActions phone="n/a" />
      </TooltipProvider>,
    );
    expect(container.querySelector("a")).toBeNull();
  });
});
