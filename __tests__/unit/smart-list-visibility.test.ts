import { describe, it, expect } from "vitest";
import { visibleSmartListItems } from "@/lib/smart-list-filters";

/** Synthetic sidebar entries — ids only, which is all the filter reads. */
const ITEMS = [
  { id: "hot", label: "Hot Clients" },
  { id: "birthdays_month", label: "Birthdays This Month" },
  { id: "email_subscribers", label: "Email Subscribers" },
];

describe("visibleSmartListItems", () => {
  it("hides lists whose count is zero", () => {
    const counts = { hot: 3, birthdays_month: 0, email_subscribers: 12 };
    expect(visibleSmartListItems(ITEMS, counts, null).map((i) => i.id)).toEqual([
      "hot",
      "email_subscribers",
    ]);
  });

  it("shows a list again as soon as it has one client", () => {
    const counts = { hot: 3, birthdays_month: 1, email_subscribers: 12 };
    expect(visibleSmartListItems(ITEMS, counts, null)).toHaveLength(3);
  });

  it("treats a missing count as zero", () => {
    expect(visibleSmartListItems(ITEMS, {}, null)).toEqual([]);
  });

  it("keeps the selected list visible even at zero so the selection is not stranded", () => {
    const counts = { hot: 0, birthdays_month: 0, email_subscribers: 0 };
    expect(visibleSmartListItems(ITEMS, counts, "birthdays_month").map((i) => i.id)).toEqual([
      "birthdays_month",
    ]);
  });
});
