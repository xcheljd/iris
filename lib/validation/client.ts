import { z } from "zod";
import { CLIENT_SOURCE_VALUES, INTEREST_INTENT_VALUES, PREFERRED_CONTACT_VALUES, BRAND_VALUES } from "@/lib/db/schema";
import { normalizeModel } from "@/lib/normalize";

// Coerces empty string to null; passes null/string through unchanged.
const nullableStr = (max: number) =>
  z.preprocess((v) => (v === "" ? null : v), z.string().max(max).nullable());

// Birthday/anniversary are day-precision TEXT columns. A client that
// JSON-serialises a Date sends "2026-08-29T07:00:00.000Z"; collapse it to the
// canonical "YYYY-MM-DD" so the month queries (substr(col, 6, 2)) and the UI
// see one shape. Anything else (a hand-typed "08/29", "Aug 29") is rejected —
// it would survive into the column and silently fall out of the month buckets.
// Shared by every write path that stores an occasion date (clients here,
// prospect graduation in ./rvx).
//
// `z.iso.date()`, not a shape regex: the regex validated the *format* and not
// the *calendar*, so "2026-02-31" and "2026-13-01" were both accepted. A
// birthday stored as "2026-02-31" reads back through parseOccasionDate as
// March 3 in the UI while the month bucket `substr(birthday, 6, 2)` still
// files it under February — two answers, no error anywhere. This is also the
// house style AGENTS.md prescribes, and what followUpDateSchema already uses.
export const occasionDate = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (t === "") return null;
    return /^\d{4}-\d{2}-\d{2}T/.test(t) ? t.slice(0, 10) : t;
  },
  z.iso.date("Use a valid date").nullable(),
);

const blankToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

// A structured product of interest. Model is upper-cased (normalizeModel);
// collection is trimmed. At least one must remain non-null — fuzzy interests
// belong in notes, not here.
export const productOfInterestSchema = z
  .object({
    model: z
      .preprocess(blankToNull, z.string().max(100).nullable())
      .transform((m) => {
        const n = normalizeModel(m);
        return n === "" ? null : n;
      }),
    collection: z
      .preprocess(blankToNull, z.string().max(100).nullable())
      .transform((c) => {
        const t = (c ?? "").trim();
        return t === "" ? null : t;
      }),
    brand: z.preprocess(blankToNull, z.enum(BRAND_VALUES).nullable()).default(null),
    intent: z.enum(INTEREST_INTENT_VALUES),
  })
  .refine((p) => p.model !== null || p.collection !== null || p.brand !== null, {
    message: "A product of interest needs a model, collection, or brand",
  });

// Allowed fields for client create. Enforces enum on source, format on email.
export const clientCreateSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  preferredContact: z.enum(PREFERRED_CONTACT_VALUES, {
    error: () => "Preferred contact method is required",
  }),
  phone: nullableStr(20).optional(),
  email: z
    .preprocess((v) => (v === "" ? null : v), z.email("Invalid email").max(200).nullable())
    .optional(),
  customerId: nullableStr(50).optional(),
  source: z.enum(CLIENT_SOURCE_VALUES).default("Walk-in"),
  birthday: occasionDate.optional(),
  anniversary: occasionDate.optional(),
  onEmailList: z.boolean().default(false),
  notes: nullableStr(5000).optional(),
  tags: z.array(z.string().max(50)).default([]),
  productsOfInterest: z.array(productOfInterestSchema).default([]),
});

// Allowed fields for client patch — all optional, no defaults.
// Building the DB patch from this schema's parsed result implements the C-03 field allowlist:
// unknown fields (heatScore, status, employeeId, dateAdded, etc.) are stripped automatically.
export const clientPatchSchema = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: nullableStr(100),
    phone: nullableStr(20),
    email: z.preprocess(
      (v) => (v === "" ? null : v),
      z.email("Invalid email").max(200).nullable(),
    ),
    customerId: nullableStr(50),
    source: z.enum(CLIENT_SOURCE_VALUES),
    preferredContact: z.enum(PREFERRED_CONTACT_VALUES),
    birthday: occasionDate,
    anniversary: occasionDate,
    onEmailList: z.boolean(),
    notes: nullableStr(5000),
    tags: z.array(z.string().max(50)),
    productsOfInterest: z.array(productOfInterestSchema),
  })
  .partial();

// A ban recorded against someone who has no client record — a walk-in the
// manager only knows by name and contact details. `banned_customers.customer_id`
// stays null, so nothing joins back to `clients` and no activity event is
// written (activity_events.client_id is a non-null FK).
export const banWalkInSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(100).nullable()).default(null),
  email: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.email("Invalid email").max(200).nullable())
    .default(null),
  phone: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(20).nullable()).default(null),
  category: z.enum(["Reselling", "Gift Card Fraud", "Other"], {
    error: () => "Ban category is required",
  }),
  reason: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(5000).nullable()).default(null),
});

// Lightweight form-side validation before submitting (H-14).
// Date fields are excluded — the date picker guarantees format correctness.
export function validateClientForm(data: {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  preferredContact?: string | null;
}): string | null {
  if (!data.firstName.trim()) return "First name is required";
  if (!data.lastName?.trim()) return "Last name is required";
  if (!data.preferredContact) return "Preferred contact method is required";
  const email = data.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email format";
  return null;
}
