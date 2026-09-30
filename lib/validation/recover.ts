import { z } from "zod";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/constants";

// Body shapes for POST /api/recover. The route is unauthenticated — it is the
// one surface that answers before a session exists — so every field is parsed
// before it reaches a query or bcrypt.
//
// The messages are the route's response contract (pinned by
// __tests__/api/recover.test.ts), which is why they live on the fields rather
// than being derived from the issue path: "All fields are required" is the one
// line the verify step has always returned for any missing field, and the
// union's own error is the "Invalid step" fallback.

const MISSING_USERNAME = "Username is required";
const MISSING_FIELD = "All fields are required";

const lookupSchema = z.object({
  step: z.literal("lookup"),
  username: z
    .string(MISSING_USERNAME)
    .min(1, MISSING_USERNAME)
    .max(50, "Username is too long"),
});

const verifySchema = z.object({
  step: z.literal("verify"),
  username: z.string(MISSING_FIELD).min(1, MISSING_FIELD).max(50, "Username is too long"),
  answer: z.string(MISSING_FIELD).min(1, MISSING_FIELD).max(200, "Answer is too long"),
  // bcrypt only hashes the first 72 bytes; a longer password is rejected
  // rather than silently truncated into the stored hash.
  newPassword: z
    .string(MISSING_FIELD)
    .min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH, `New password must be at most ${MAX_PASSWORD_LENGTH} characters`),
});

export const recoverRequestSchema = z.discriminatedUnion("step", [lookupSchema, verifySchema], {
  error: () => "Invalid step",
});
