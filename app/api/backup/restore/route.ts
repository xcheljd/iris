import { withManagerAuth } from "@/lib/api-helpers";
import { performRestore } from "@/lib/db/restore";

export const POST = withManagerAuth(async (_session, req: Request) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const result = await performRestore(Buffer.from(await file.arrayBuffer()));
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  // Stream the response body, then exit once the stream is closed.
  // Scheduling exit inside start() ensures the body bytes are fully produced
  // before the 500ms countdown begins — eliminating the race with process.exit.
  // Deliberately untested: performRestore (lib/db/restore.ts) carries the
  // restore mechanics and is covered by __tests__/unit/restore.test.ts.
  const payload = new TextEncoder().encode(JSON.stringify({ ok: true }));
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
      setTimeout(() => process.exit(0), 500);
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/json" } });
});
