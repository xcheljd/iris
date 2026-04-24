"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart3,
  Users,
  Flame,
  Snowflake,
  Sun,
  Phone,
  MessageCircle,
  Mail,
  User,
  TrendingUp,
  Target,
  ShoppingCart,
  Calendar,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

interface Stats {
  total: number;
  active: number;
  hot: number;
  warm: number;
  cold: number;
  banned: number;
  unsubscribed: number;
  outreachWeek: number;
  purchasesWeek: number;
}

interface OutreachRow {
  log: {
    id: string;
    method: string;
    date: Date;
    outcome: string;
    notes: string | null;
  };
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
  } | null;
  employee: {
    name: string;
  } | null;
}

interface AnalyticsContentProps {
  stats: Stats;
  recentOutreach: OutreachRow[];
}

function getMethodIcon(method: string) {
  switch (method) {
    case "call": return <Phone className="h-3.5 w-3.5" />;
    case "text": return <MessageCircle className="h-3.5 w-3.5" />;
    case "email": return <Mail className="h-3.5 w-3.5" />;
    case "in-person": return <User className="h-3.5 w-3.5" />;
    default: return <MessageCircle className="h-3.5 w-3.5" />;
  }
}

function getOutcomeColor(outcome: string) {
  switch (outcome) {
    case "purchased": return "text-emerald-500";
    case "wants_to_come_in": return "text-green-500";
    case "responded": return "text-blue-500";
    case "not_interested": return "text-red-500";
    case "no_answer": return "text-muted-foreground";
    case "voicemail": return "text-yellow-500";
    case "voicemail_full": return "text-red-400";
    default: return "text-muted-foreground";
  }
}

export function AnalyticsContent({ stats, recentOutreach }: AnalyticsContentProps) {
  // Compute method distribution
  const methodDistribution = useMemo(() => {
    const counts: Record<string, number> = { call: 0, text: 0, email: 0, "in-person": 0 };
    recentOutreach.forEach((r) => {
      if (counts[r.log.method] !== undefined) counts[r.log.method]++;
    });
    return counts;
  }, [recentOutreach]);

  // Compute outcome distribution
  const outcomeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    recentOutreach.forEach((r) => {
      counts[r.log.outcome] = (counts[r.log.outcome] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [recentOutreach]);

  const totalOutreach = Object.values(methodDistribution).reduce((a, b) => a + b, 0);
  const conversionRate = totalOutreach > 0 
    ? Math.round((stats.purchasesWeek / stats.outreachWeek) * 100) 
    : 0;

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Performance metrics and outreach insights
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="outreach">Outreach</TabsTrigger>
          <TabsTrigger value="heat">Heat Distribution</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Clients</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">{stats.active} active</p>
                  </div>
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Outreach (7d)</p>
                    <p className="text-2xl font-bold">{stats.outreachWeek}</p>
                  </div>
                  <Phone className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Purchases (7d)</p>
                    <p className="text-2xl font-bold text-emerald-500">{stats.purchasesWeek}</p>
                  </div>
                  <ShoppingCart className="h-8 w-8 text-emerald-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Conversion</p>
                    <p className="text-2xl font-bold">{conversionRate}%</p>
                  </div>
                  <Target className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Heat Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5" />
                Client Heat Distribution
              </CardTitle>
              <CardDescription>Active clients by engagement level</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats.active > 0 ? (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Flame className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">Hot</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{stats.hot}</span>
                        <span className="text-xs text-muted-foreground">
                          ({Math.round((stats.hot / stats.active) * 100)}%)
                        </span>
                      </div>
                    </div>
                    <Progress value={(stats.hot / stats.active) * 100} className="h-2" />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sun className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">Warm</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{stats.warm}</span>
                        <span className="text-xs text-muted-foreground">
                          ({Math.round((stats.warm / stats.active) * 100)}%)
                        </span>
                      </div>
                    </div>
                    <Progress value={(stats.warm / stats.active) * 100} className="h-2" />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Snowflake className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Cold</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{stats.cold}</span>
                        <span className="text-xs text-muted-foreground">
                          ({Math.round((stats.cold / stats.active) * 100)}%)
                        </span>
                      </div>
                    </div>
                    <Progress value={(stats.cold / stats.active) * 100} className="h-2" />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No active clients</p>
              )}
            </CardContent>
          </Card>

          {/* Compliance */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Banned</p>
                    <p className="text-2xl font-bold text-red-500">{stats.banned}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Unsubscribed</p>
                    <p className="text-2xl font-bold text-muted-foreground">{stats.unsubscribed}</p>
                  </div>
                  <Mail className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Outreach Tab */}
        <TabsContent value="outreach" className="space-y-6">
          {/* Method Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Method Distribution</CardTitle>
              <CardDescription>Breakdown of outreach methods</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {totalOutreach > 0 ? (
                Object.entries(methodDistribution).map(([method, count]) => (
                  <div key={method} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getMethodIcon(method)}
                        <span className="text-sm font-medium capitalize">{method}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{count}</span>
                        <span className="text-xs text-muted-foreground">
                          ({Math.round((count / totalOutreach) * 100)}%)
                        </span>
                      </div>
                    </div>
                    <Progress value={(count / totalOutreach) * 100} className="h-2" />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No outreach data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Outcome Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Outcome Breakdown</CardTitle>
              <CardDescription>Results from recent outreach</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {outcomeDistribution.length > 0 ? (
                outcomeDistribution.map(([outcome, count]) => (
                  <div key={outcome} className="flex items-center justify-between">
                    <span className={`text-sm capitalize ${getOutcomeColor(outcome)}`}>
                      {outcome.replace(/_/g, " ")}
                    </span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No outreach data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Outreach Log */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Outreach</CardTitle>
              <CardDescription>Last 50 outreach entries</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {recentOutreach.map((row) => (
                    <div
                      key={row.log.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {getMethodIcon(row.log.method)}
                        <div className="min-w-0">
                          {row.client ? (
                            <Link
                              href={`/clients/${row.client.id}`}
                              className="text-sm font-medium hover:underline"
                            >
                              {row.client.firstName} {row.client.lastName || ""}
                            </Link>
                          ) : (
                            <span className="text-sm text-muted-foreground">Unknown client</span>
                          )}
                          <p className={`text-xs capitalize ${getOutcomeColor(row.log.outcome)}`}>
                            {row.log.outcome.replace(/_/g, " ")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {row.log.date ? format(new Date(row.log.date), "MMM d") : ""}
                        </p>
                        {row.employee && (
                          <p className="text-xs text-muted-foreground">{row.employee.name}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Heat Tab */}
        <TabsContent value="heat" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Heat Score Insights</CardTitle>
              <CardDescription>
                Understanding your client engagement distribution
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Visual Bar */}
              <div className="flex rounded-lg overflow-hidden h-8">
                {stats.active > 0 ? (
                  <>
                    <div
                      className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${(stats.hot / stats.active) * 100}%` }}
                    >
                      {stats.hot > 0 ? `🔥 ${stats.hot}` : ""}
                    </div>
                    <div
                      className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${(stats.warm / stats.active) * 100}%` }}
                    >
                      {stats.warm > 0 ? `☀️ ${stats.warm}` : ""}
                    </div>
                    <div
                      className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${(stats.cold / stats.active) * 100}%` }}
                    >
                      {stats.cold > 0 ? `❄️ ${stats.cold}` : ""}
                    </div>
                  </>
                ) : (
                  <div className="bg-muted flex-1 flex items-center justify-center text-muted-foreground text-sm">
                    No data
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <span className="font-medium">Hot</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stats.hot} client{stats.hot !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Highly engaged, recent interaction
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1">
                    <Sun className="h-4 w-4 text-yellow-500" />
                    <span className="font-medium">Warm</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stats.warm} client{stats.warm !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Moderate engagement
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1">
                    <Snowflake className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Cold</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stats.cold} client{stats.cold !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Needs re-engagement
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}