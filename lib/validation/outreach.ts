import { z } from "zod";
import { OUTREACH_METHOD_VALUES, OUTREACH_OUTCOME_VALUES } from "@/lib/db/schema";

/** A calendar day (`YYYY-MM-DD`) — the same shape `outreachInputSchema.followUpDate` accepts. */
export const followUpDateSchema = z.iso.date();

export const PAST_FOLLOW_UP_ERROR = "Follow-up date can't be in the past";

/**
 * A follow-up dated before today would be overdue the moment it's saved, so
 * the write paths refuse it. Today itself is fine ("call back this
 * afternoon"). Both sides are local `YYYY-MM-DD`, so string order is day order.
 */
export function isPastFollowUpDay(day: string, now: Date = new Date()): boolean {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return day < today;
}

export const outreachInputSchema = z
  .object({
    clientId: z.uuid(),
    method: z.enum(OUTREACH_METHOD_VALUES),
    outcome: z.enum(OUTREACH_OUTCOME_VALUES),
    purchasedModel: z.string().max(100).optional(),
    notes: z.string().max(2000).optional(),
    followUpDate: z.iso.date().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.outcome === "purchased" && !data.purchasedModel?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["purchasedModel"],
        message: "Model purchased is required when the outcome is a purchase",
      });
    }
  });

export type OutreachInput = z.infer<typeof outreachInputSchema>;
