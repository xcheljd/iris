import { Suspense } from "react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HeatBadge } from "@/components/heat-badge";
import { getStats, getOverdueFollowUps, getUpcomingFollowUps, getRecentActivity, getTopHotClients, getClientsBirthdayCurrentMonth } from "@/lib/queries";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { Flame, Phone, ShoppingBag, Users, AlertCircle, Calendar, ArrowRight, TrendingUp, Target, Clock, CheckCircle2 } from "lucide-react";
import { formatDate, daysAgo } from "@/lib/utils";
import { DashboardSkeleton } from "@/components/skeletons";

export default function DashboardPage() {
  return (
    <Suspense fallback={<><Topbar title="Dashboard" /><DashboardSkeleton /></>}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";
  const employeeId = !isManager ? (session?.user?.id ?? undefined) : undefined;
  const [stats, overdue, upcoming, activity, hot, birthdayClients] = await Promise.all([
    getStats(employeeId),
    getOverdueFollowUps(employeeId),
    getUpcomingFollowUps(employeeId),
    getRecentActivity(20, employeeId),
    getTopHotClients(employeeId, 6),
    getClientsBirthdayCurrentMonth(employeeId),
  ]);
  const now14 = Date.now();
  const birthdays = birthdayClients.filter((c) => {
    if (!c.birthday) return false;
    const [, m, d] = c.birthday.split("-").map(Number);
    const bd = new Date(new Date().getFullYear(), (m || 1) - 1, d || 1);
    const diff = (bd.getTime() - now14) / 86400000;
    return diff >= -1 && diff <= 14;
  }).slice(0, 5);

  const conversionRate = stats.outreachWeek > 0 ? Math.round((stats.purchasesWeek / stats.outreachWeek) * 100) : 0;
  const activePercent = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="flex-1 p-4 md:p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-tour="dashboard-stats">
          <StatCard icon={Users} label="Total Clients" value={stats.total} sublabel={`${stats.active} active`} />
          <StatCard icon={Flame} label="Hot Leads" value={stats.hot} accent />
          <StatCard icon={Phone} label="Outreach (7d)" value={stats.outreachWeek} />
          <StatCard icon={ShoppingBag} label="Purchases (7d)" value={stats.purchasesWeek} color="text-emerald-500" />
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="md:col-span-2">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" /> Overdue follow-ups
                    </CardTitle>
                    <CardDescription>{overdue.length} need attention</CardDescription>
                  </div>
                  <Button asChild variant="ghost" size="sm"><Link href="/follow-ups">All <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
                </CardHeader>
                <CardContent>
                  {overdue.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nothing overdue</p>
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {overdue.slice(0, 6).map((row) => (
                        <li key={row.log.id} className="flex items-center justify-between py-2">
                          <Link href={`/clients/${row.client?.id}`} className="hover:underline text-sm min-w-0 flex-1 mr-2">
                            <span className="font-medium">{row.client?.firstName} {row.client?.lastName ?? ""}</span>
                            <span className="text-muted-foreground ml-2 text-xs">due {formatDate(row.log.followUpDate)}</span>
                            {row.log.notes && <span className="block text-xs text-muted-foreground truncate">{row.log.notes}</span>}
                            {!row.log.notes && <span className="block text-xs text-muted-foreground capitalize">{row.log.method} — {row.log.outcome.replace(/_/g, " ")}</span>}
                          </Link>
                          <Badge variant="destructive" className="text-[10px] shrink-0">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {daysAgo(row.log.followUpDate)}
                          </Badge>
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
                        <li key={row.log.id} className="text-sm flex flex-col">
                          <div className="flex justify-between">
                            <Link href={`/clients/${row.client?.id}`} className="hover:underline truncate">
                              {row.client?.firstName} {row.client?.lastName ?? ""}
                            </Link>
                            <span className="text-xs text-muted-foreground shrink-0 ml-2">{formatDate(row.log.followUpDate)}</span>
                          </div>
                          {(row.log.notes || row.log.method) && (
                            <span className="text-xs text-muted-foreground truncate mt-0.5">
                              {row.log.notes || `${row.log.method} — ${row.log.outcome.replace(/_/g, " ")}`}
                            </span>
                          )}
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
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Recent Activity
                </CardTitle>
                <CardDescription>Latest events across the floor</CardDescription>
              </CardHeader>
              <CardContent>
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
                ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="hidden sm:table-cell">Employee</TableHead>
                        <TableHead className="hidden md:table-cell">Details</TableHead>
                        <TableHead className="text-right">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activity.map((a) => {
                        const ev = a.event;
                        const type = ev.eventType;
                        return (
                          <TableRow key={ev.id}>
                            <TableCell>
                              <EventBadge type={type} />
                            </TableCell>
                            <TableCell>
                              {a.clientId ? (
                                <Link href={`/clients/${a.clientId}`} className="font-medium hover:underline text-sm">
                                  {a.clientName || "Unknown"}
                                </Link>
                              ) : (
                                <span className="text-sm text-muted-foreground">&mdash;</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                              {a.employeeName || "—"}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                              {ev.description}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="text-xs text-muted-foreground">{formatDate(ev.createdAt)}</div>
                              <div className="text-xs text-muted-foreground">{daysAgo(ev.createdAt)}</div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Metrics Tab */}
          <TabsContent value="metrics" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Conversion Rate</p>
                      <p className="text-2xl font-bold">{conversionRate}%</p>
                    </div>
                    <Target className="h-8 w-8 text-orange-500" />
                  </div>
                  <Progress value={conversionRate} className="h-2 mt-3" aria-label="Conversion rate" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Clients</p>
                      <p className="text-2xl font-bold">{activePercent}%</p>
                    </div>
                    <Users className="h-8 w-8 text-blue-500" />
                  </div>
                  <Progress value={activePercent} className="h-2 mt-3" aria-label="Active clients percentage" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Overdue</p>
                      <p className="text-2xl font-bold text-red-500">{overdue.length}</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-red-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Banned</p>
                      <p className="text-2xl font-bold">{stats.banned}</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Heat Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Client Heat Distribution
                </CardTitle>
                <CardDescription>{stats.active} active clients</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {stats.active > 0 ? (
                  <>
                    <div className="flex rounded-lg overflow-hidden h-10" role="img" aria-label={`Heat distribution: ${stats.hot} hot, ${stats.warm} warm, ${stats.cold} cold`}>
                      <div role="presentation" className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium overflow-hidden" style={{ width: `${(stats.hot / stats.active) * 100}%` }} aria-hidden="true">
                        {stats.hot > 0 ? `${stats.hot} Hot` : ""}
                      </div>
                      <div role="presentation" className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium overflow-hidden" style={{ width: `${(stats.warm / stats.active) * 100}%` }} aria-hidden="true">
                        {stats.warm > 0 ? `${stats.warm} Warm` : ""}
                      </div>
                      <div role="presentation" className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium overflow-hidden" style={{ width: `${(stats.cold / stats.active) * 100}%` }} aria-hidden="true">
                        {stats.cold > 0 ? `${stats.cold} Cold` : ""}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center text-sm">
                      <div>
                        <p className="font-medium text-orange-500">{stats.hot}</p>
                        <p className="text-muted-foreground">Hot</p>
                      </div>
                      <div>
                        <p className="font-medium text-yellow-500">{stats.warm}</p>
                        <p className="text-muted-foreground">Warm</p>
                      </div>
                      <div>
                        <p className="font-medium text-blue-500">{stats.cold}</p>
                        <p className="text-muted-foreground">Cold</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No active clients</p>
                )}
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Unsubscribed</p>
                      <p className="text-2xl font-bold">{stats.unsubscribed}</p>
                    </div>
                    <Link href="/unsubscribed">
                      <Button variant="ghost" size="sm">View <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Outreach (7d)</p>
                      <p className="text-2xl font-bold">{stats.outreachWeek}</p>
                    </div>
                    <Link href="/analytics">
                      <Button variant="ghost" size="sm">Analytics <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function EventBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    created: { label: "Created", variant: "default" },
    edited: { label: "Edited", variant: "outline" },
    outreach_logged: { label: "Outreach", variant: "secondary" },
    purchase: { label: "Purchase", variant: "default" },
    tag_added: { label: "Tag +", variant: "outline" },
    tag_removed: { label: "Tag \u2212", variant: "outline" },
    transferred: { label: "Transferred", variant: "outline" },
    note_added: { label: "Note", variant: "outline" },
    status_changed: { label: "Status", variant: "secondary" },
    ban_requested: { label: "Ban Req", variant: "outline" },
    ban_approved: { label: "Ban \u2713", variant: "destructive" },
    ban_rejected: { label: "Ban \u2717", variant: "outline" },
    unsub_requested: { label: "Unsub Req", variant: "outline" },
    unsub_approved: { label: "Unsub \u2713", variant: "secondary" },
    unsub_rejected: { label: "Unsub \u2717", variant: "outline" },
    delete_requested: { label: "Del Req", variant: "outline" },
    delete_approved: { label: "Deleted", variant: "destructive" },
    delete_rejected: { label: "Del \u2717", variant: "outline" },
  };
  const c = config[type] || { label: type, variant: "outline" as const };
  return <Badge variant={c.variant} className="text-xs whitespace-nowrap">{c.label}</Badge>;
}

function StatCard({ icon: Icon, label, value, sublabel, accent, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sublabel?: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <Card className="border-border/50 hover:border-border hover:shadow-md transition-all">
      <CardContent className="p-3 md:p-4 flex items-center gap-3">
        <div className={`h-9 w-9 md:h-10 md:w-10 rounded-md flex items-center justify-center shrink-0 ${accent ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-4 w-4 md:h-5 md:w-5" />
        </div>
        <div className="min-w-0">
          <p className={`text-xl md:text-2xl font-semibold font-mono leading-tight ${color || ""}`}>{value}</p>
          <p className="text-[11px] md:text-xs text-muted-foreground truncate">{sublabel || label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
