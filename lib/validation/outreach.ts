import { z } from "zod";
import { OUTREACH_METHOD_VALUES, OUTREACH_OUTCOME_VALUES } from "@/lib/db/schema";

/** A calendar day (`YYYY-MM-DD`) — the same shape `outreachInputSchema.followUpDate` accepts. */
export const followUpDateSchema = z.iso.date();

export const outreachInputSchema = z
  .object({
    clientId: z.uuid(),
    method: z.enum(OUTREACH_METHOD_VALUES),
    outcome: z.enum(OUTREACH_OUTCOME_VALUES),
    purchasedModel: z.string().max(100).optional(),
    notes: z.string().max(2000).optional(),
    followUpDate: z.iso.date().nullable().optional(),
    templateId: z.uuid().optional(),
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
