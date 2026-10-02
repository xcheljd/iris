import { z } from "zod";

// Same cap as the other name fields (client/employee names are max 100).
export const smartListNameSchema = z
  .string()
  .trim()
  .min(1, "List name is required")
  .max(100, "List name must be 100 characters or fewer");

const optionalText = z.string().max(200).optional();
const unixSeconds = z.number().optional();

// Known smart-list filter keys: ClientFilterParams plus the legacy/extra keys
// SmartListFilters reads (lib/smart-list-filters.ts) and the seed's
// `promoMatch`. Unknown keys are rejected rather than stored as an opaque blob.
export const smartListFiltersSchema = z.strictObject({
  q: optionalText,
  nameQ: optionalText,
  contactQ: optionalText,
  heat: optionalText,
  owner: optionalText,
  tags: z.array(z.string().max(200)).optional(),
  tagMode: z.enum(["any", "all"]).optional(),
  lastContactFrom: unixSeconds,
  lastContactTo: unixSeconds,
  createdFrom: unixSeconds,
  createdTo: unixSeconds,
  filter: optionalText,
  heatLevel: optionalText,
  source: optionalText,
  onEmailList: z.boolean().optional(),
  stale: z.boolean().optional(),
  birthdayMonth: z.union([z.string().max(2), z.number().int().min(1).max(12)]).optional(),
  tag: optionalText,
  promoMatch: optionalText,
});
