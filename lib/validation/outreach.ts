import { z } from "zod";
import { OUTREACH_METHOD_VALUES, OUTREACH_OUTCOME_VALUES } from "@/lib/db/schema";

export const outreachInputSchema = z.object({
  clientId: z.string().uuid(),
  method: z.enum(OUTREACH_METHOD_VALUES),
  outcome: z.enum(OUTREACH_OUTCOME_VALUES),
  purchasedModel: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  followUpDate: z.string().date().nullable().optional(),
  templateId: z.string().uuid().optional(),
});

export type OutreachInput = z.infer<typeof outreachInputSchema>;
