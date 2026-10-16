import { describe, it, expect } from "vitest";
import { OUTCOME_LABELS, getOutcomeColor, outcomeLabel } from "@/lib/outreach-helpers";
import { OUTREACH_OUTCOME_VALUES } from "@/lib/db/schema";

describe("outreach outcome helpers", () => {
  it("labels every schema outcome exactly once", () => {
    expect(Object.keys(OUTCOME_LABELS).sort()).toEqual([...OUTREACH_OUTCOME_VALUES].sort());
  });

  it("uses one name per outcome", () => {
    expect(outcomeLabel("wants_to_come_in")).toBe("Wants to come in");
    expect(outcomeLabel("voicemail_full")).toBe("Voicemail full");
    expect(outcomeLabel("voicemail")).toBe("Left voicemail");
    expect(outcomeLabel("some_future_value")).toBe("some future value");
  });

  it("colours outcomes with theme tokens, never raw palette classes", () => {
    for (const o of OUTREACH_OUTCOME_VALUES) {
      expect(getOutcomeColor(o)).toMatch(/^text-(success|warning|destructive|muted-foreground)$/);
    }
  });
});
