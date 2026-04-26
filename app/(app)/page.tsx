import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HeatBadge } from "@/components/heat-badge";
import { getStats, getOverdueFollowUps, getUpcomingFollowUps, getRecentOutreach, getAllClients } from "@/lib/queries";
import Link from "next/link";
import { Flame, Phone, ShoppingBag, Users, AlertCircle, Calendar, ArrowRight, TrendingUp, Target, Clock, CheckCircle2 } from "lucide-react";
import { formatDate, formatDateTime, daysAgo } from "@/lib/utils";

export default async function DashboardPage() {
  const stats = await getStats();
  const overdue = await getOverdueFollowUps();
  const upcoming = await getUpcomingFollowUps();
  const recent = await getRecentOutreach(20);
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

  const conversionRate = stats.outreachWeek > 0 ? Math.round((stats.purchasesWeek / stats.outreachWeek) * 100) : 0;
  const activePercent = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="flex-1 p-4 md:p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                          <Link href={`/clients/${row.client?.id}`} className="hover:underline text-sm">
                            <span className="font-medium">{row.client?.firstName} {row.client?.lastName ?? ""}</span>
                            <span className="text-muted-foreground ml-2 text-xs">due {formatDate(row.log.followUpDate)}</span>
                          </Link>
                          <Badge variant="destructive" className="text-[10px]">
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
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Recent Activity
                </CardTitle>
                <CardDescription>Latest outreach across the floor</CardDescription>
              </CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Method</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent.map((r) => (
                        <TableRow key={r.log.id}>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{r.log.method}</Badge>
                          </TableCell>
                          <TableCell>
                            <Link href={`/clients/${r.client?.id}`} className="font-medium hover:underline">
                              {r.client?.firstName} {r.client?.lastName ?? ""}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground capitalize">
                            {r.log.outcome.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.employee?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="text-xs text-muted-foreground">{formatDate(r.log.date)}</div>
                            <div className="text-xs text-muted-foreground">{daysAgo(r.log.date)}</div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                    <div className="flex rounded-lg overflow-hidden h-10">
                      <div className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium" style={{ width: `${(stats.hot / stats.active) * 100}%` }}>
                        {stats.hot > 0 ? `${stats.hot} Hot` : ""}
                      </div>
                      <div className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium" style={{ width: `${(stats.warm / stats.active) * 100}%` }}>
                        {stats.warm > 0 ? `${stats.warm} Warm` : ""}
                      </div>
                      <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium" style={{ width: `${(stats.cold / stats.active) * 100}%` }}>
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
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-md flex items-center justify-center ${accent ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className={`text-2xl font-semibold font-mono ${color || ""}`}>{value}</p>
          <p className="text-xs text-muted-foreground">{sublabel || label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
