import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeatBadge } from "@/components/heat-badge";
import { getStats, getOverdueFollowUps, getUpcomingFollowUps, getRecentOutreach, getAllClients } from "@/lib/queries";
import Link from "next/link";
import { Flame, Phone, ShoppingBag, Users, AlertCircle, Calendar, ArrowRight } from "lucide-react";
import { formatDate, formatDateTime, daysAgo } from "@/lib/utils";

export default async function DashboardPage() {
  const stats = await getStats();
  const overdue = await getOverdueFollowUps();
  const upcoming = await getUpcomingFollowUps();
  const recent = await getRecentOutreach(8);
  const clients = await getAllClients();
  const hot = clients.filter((c) => c.heatLevel === "hot" && c.status === "active").slice(0, 6);
  const birthdays = clients.filter((c) => {
    if (!c.birthday) return false;
    const [, m, d] = c.birthday.split("-").map(Number);
    const now = new Date();
    const bd = new Date(now.getFullYear(), (m || 1) - 1, d || 1);
    const diff = (bd.getTime() - now.getTime()) / 86400000;
    return diff >= -1 && diff <= 14;
  }).slice(0, 5);

  return (
    <>
      <Topbar title="Dashboard" />
      <main className="flex-1 p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Total Clients" value={stats.total} />
          <StatCard icon={Flame} label="Hot Leads" value={stats.hot} accent />
          <StatCard icon={Phone} label="Outreach (7d)" value={stats.outreachWeek} />
          <StatCard icon={ShoppingBag} label="Purchases (7d)" value={stats.purchasesWeek} />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><AlertCircle className="h-4 w-4 text-destructive" /> Overdue follow-ups</CardTitle>
                <CardDescription>{overdue.length} need attention</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm"><Link href="/follow-ups">All <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
            </CardHeader>
            <CardContent>
              {overdue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing overdue. </p>
              ) : (
                <ul className="divide-y">
                  {overdue.slice(0, 6).map((row) => (
                    <li key={row.log.id} className="flex items-center justify-between py-2">
                      <Link href={`/clients/${row.client?.id}`} className="hover:underline text-sm">
                        <span className="font-medium">{row.client?.firstName} {row.client?.lastName ?? ""}</span>
                        <span className="text-muted-foreground ml-2 text-xs">due {formatDate(row.log.followUpDate)}</span>
                      </Link>
                      <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-accent" /> Upcoming (7d)</CardTitle>
              <CardDescription>{upcoming.length} scheduled</CardDescription>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
                <ul className="space-y-2">
                  {upcoming.slice(0, 6).map((row) => (
                    <li key={row.log.id} className="text-sm flex justify-between">
                      <Link href={`/clients/${row.client?.id}`} className="hover:underline truncate">
                        {row.client?.firstName} {row.client?.lastName ?? ""}
                      </Link>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">{formatDate(row.log.followUpDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Flame className="h-4 w-4 text-red-400" /> Hot leads</CardTitle>
                <CardDescription>Top {hot.length} ready to convert</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm"><Link href="/smart-lists">Smart lists <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
            </CardHeader>
            <CardContent>
              {hot.length === 0 ? <p className="text-sm text-muted-foreground">No hot leads yet.</p> : (
                <ul className="divide-y">
                  {hot.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2">
                      <Link href={`/clients/${c.id}`} className="text-sm hover:underline font-medium">
                        {c.firstName} {c.lastName ?? ""}
                      </Link>
                      <div className="flex items-center gap-2">
                        {c.lastOutreachAt && <span className="text-xs text-muted-foreground">Last contact {daysAgo(c.lastOutreachAt)}</span>}
                        <HeatBadge level={c.heatLevel} score={c.heatScore} showScore />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming birthdays</CardTitle>
              <CardDescription>Next 14 days</CardDescription>
            </CardHeader>
            <CardContent>
              {birthdays.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
                <ul className="space-y-2">
                  {birthdays.map((c) => (
                    <li key={c.id} className="text-sm flex justify-between">
                      <Link href={`/clients/${c.id}`} className="hover:underline">{c.firstName} {c.lastName ?? ""}</Link>
                      <span className="text-xs text-muted-foreground">{c.birthday}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Latest outreach across the floor</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {recent.map((r) => (
                <li key={r.log.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="capitalize">{r.log.method}</Badge>
                    <Link href={`/clients/${r.client?.id}`} className="font-medium hover:underline truncate">
                      {r.client?.firstName} {r.client?.lastName ?? ""}
                    </Link>
                    <span className="text-xs text-muted-foreground truncate">{r.log.outcome.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">by {r.employee?.name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(r.log.date)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-md flex items-center justify-center ${accent ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold font-mono">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
