import { z } from "zod";
import { productOfInterestSchema } from "./client";
import { PREFERRED_CONTACT_VALUES } from "@/lib/db/schema";

const nullableStr = (max: number) =>
  z.preprocess((v) => (v === "" ? null : v), z.string().max(max).nullable());

export const graduateProspectSchema = z.object({
  prospectId: z.string().min(1),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  preferredContact: z.enum(PREFERRED_CONTACT_VALUES, {
    errorMap: () => ({ message: "Preferred contact method is required" }),
  }),
  phone: nullableStr(20).optional(),
  email: z
    .preprocess((v) => (v === "" ? null : v), z.string().email("Invalid email").max(200).nullable())
    .optional(),
  birthday: nullableStr(100).optional(),
  anniversary: nullableStr(100).optional(),
  productsOfInterest: z.array(productOfInterestSchema).default([]),
  notes: nullableStr(5000).optional(),
});

export type GraduateProspectInput = z.infer<typeof graduateProspectSchema>;
