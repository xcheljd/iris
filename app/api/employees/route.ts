import { withAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";

export const GET = withAuth(async () => {
  const all = db.select().from(employees).orderBy(employees.name).all();
  const safe = all.map(({ passwordHash: _passwordHash, secretAnswerHash: _secretAnswerHash, ...rest }) => rest);
  return Response.json(safe);
});
