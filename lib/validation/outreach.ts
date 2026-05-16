import { z } from "zod";
import { OUTREACH_METHOD_VALUES, OUTREACH_OUTCOME_VALUES } from "@/lib/db/schema";

export const outreachInputSchema = z
  .object({
    clientId: z.string().uuid(),
    method: z.enum(OUTREACH_METHOD_VALUES),
    outcome: z.enum(OUTREACH_OUTCOME_VALUES),
    purchasedModel: z.string().max(100).optional(),
    notes: z.string().max(2000).optional(),
    followUpDate: z.string().date().nullable().optional(),
    templateId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.outcome === "purchased" && !data.purchasedModel?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["purchasedModel"],
        message: "Model purchased is required when the outcome is a purchase",
      });
    }
  });

export type OutreachInput = z.infer<typeof outreachInputSchema>;
