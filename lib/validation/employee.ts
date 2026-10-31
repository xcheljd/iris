import { z } from "zod";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/constants";

// The employee server actions are RPC endpoints: their arguments arrive over
// the wire and the declared TypeScript types are erased before they land, so a
// bogus role or a 10 KB username reaches the UPDATE unless it is parsed here.
// `employees.role` is a two-value enum column (lib/db/schema.ts) — a value
// outside it survives into the row and then reads back as "not a manager"
// everywhere, which is corrupt data rather than a denied request.
export const employeeRoleSchema = z.enum(["manager", "associate"], {
  error: () => "Role must be manager or associate",
});

/** `toggleEmployeeActive`'s flag — `employees.active` is a boolean column. */
export const employeeActiveSchema = z.boolean({ error: () => "Invalid request" });

// bcrypt hashes at most 72 bytes and silently ignores the rest, so a longer
// password would authenticate on its first 72 bytes alone — reject instead.
// The label is a parameter because the surfaces that report these messages are
// pinned to different wording ("Password…" on reset, "New password…" on
// change-own and account recovery).
const passwordField = (label: string) =>
  z
    .string()
    .min(MIN_PASSWORD_LENGTH, `${label} must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH, `${label} must be at most ${MAX_PASSWORD_LENGTH} characters`);

export const employeePasswordSchema = passwordField("Password");
export const newPasswordSchema = passwordField("New password");

// The add/edit dialogs submit "" for an omitted last name; `employees.last_name`
// is nullable, so collapse it rather than storing an empty string.
const lastNameField = z
  .preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(100).nullable(),
  )
  .default(null);

export const employeeCreateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: lastNameField,
  username: z.string().trim().min(1, "Username is required").max(50),
  password: employeePasswordSchema,
  role: employeeRoleSchema,
});

// Edit never touches the password (that goes through resetEmployeePassword /
// changeOwnPassword) and leaves the role alone when the caller omits it.
export const employeeUpdateSchema = employeeCreateSchema
  .omit({ password: true })
  .extend({ role: employeeRoleSchema.optional() });
