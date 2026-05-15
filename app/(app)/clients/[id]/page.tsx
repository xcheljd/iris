import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoMatches, promoWatches, clientTags, employees } from "@/lib/db/schema";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { ClientDetailContent } from "./client-detail-content";
import { ClientDetailSkeleton } from "@/components/skeletons";
import { getSession } from "@/lib/auth";

async function getFullClient(clientId: string) {
  const row = db
    .select({
      client: clients,
      employeeName: sql`COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')`,
    })
    .from(clients)
    .leftJoin(employees, eq(clients.employeeId, employees.id))
    .where(eq(clients.id, clientId))
    .get();

  if (!row) return null;

  const client = row.client;
  const employeeName = row.employeeName;

  const outreach = db
    .select()
    .from(outreachLogs)
    .where(eq(outreachLogs.clientId, clientId))
    .orderBy(desc(outreachLogs.date))
    .all();

  const timeline = db
    .select({
      event: activityEvents,
      eventEmployeeName: sql`COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')`,
    })
    .from(activityEvents)
    .leftJoin(employees, eq(activityEvents.employeeId, employees.id))
    .where(eq(activityEvents.clientId, clientId))
    .orderBy(desc(activityEvents.createdAt))
    .all()
    .map((row) => ({ ...row.event, employeeName: row.eventEmployeeName }));

  const matches = db
    .select({
      match: promoMatches,
      promo: promoWatches,
    })
    .from(promoMatches)
    .leftJoin(promoWatches, eq(promoMatches.promoId, promoWatches.id))
    .where(eq(promoMatches.clientId, clientId))
    .all();

  const allTags = db
    .select()
    .from(clientTags)
    .orderBy(desc(clientTags.usageCount))
    .all();

  const followUps = db
    .select()
    .from(outreachLogs)
    .where(
      and(
        eq(outreachLogs.clientId, clientId),
        isNull(outreachLogs.completed)
      )
    )
    .orderBy(desc(outreachLogs.followUpDate))
    .all();

  return {
    ...client,
    employeeName,
    outreach,
    timeline,
    matches,
    allTags,
    followUps,
  };
}

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<ClientDetailSkeleton />}>
      <ClientDetailFetcher params={params} />
    </Suspense>
  );
}

async function ClientDetailFetcher({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const client = await getFullClient(id);
  if (!client) {
    notFound();
  }
  const isManager = session?.user?.role === "manager";
  if (!isManager && client.employeeId !== session?.user?.id) {
    notFound();
  }
  // Bump global recency so future searches nudge this client toward the top.
  // Fire-and-forget — never blocks the page render and silently swallows any
  // write error (e.g. read-only filesystem in tests).
  try {
    db.update(clients).set({ lastViewedAt: new Date() }).where(eq(clients.id, id)).run();
  } catch {
    // ignore — search ranking is a nice-to-have, never a page blocker
  }
  return <ClientDetailContent client={JSON.parse(JSON.stringify(client))} currentUserRole={session?.user?.role ?? "associate"} />;
}
