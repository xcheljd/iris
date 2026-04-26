"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
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
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertTriangle,
  MailX,
  Ban,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { format, isAfter, isBefore, subDays, startOfDay, endOfDay } from "date-fns";

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

const HEAT_COLORS = ["#f97316", "#eab308", "#3b82f6"];
const METHOD_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f97316"];

const heatChartConfig = {
  hot: { label: "Hot", color: "#f97316" },
  warm: { label: "Warm", color: "#eab308" },
  cold: { label: "Cold", color: "#3b82f6" },
} satisfies ChartConfig;

const methodChartConfig = {
  call: { label: "Call", color: "#3b82f6" },
  text: { label: "Text", color: "#22c55e" },
  email: { label: "Email", color: "#a855f7" },
  "in-person": { label: "In-Person", color: "#f97316" },
} satisfies ChartConfig;

export function AnalyticsContent({ stats, recentOutreach }: AnalyticsContentProps) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const filteredOutreach = useMemo(() => {
    if (!dateFrom && !dateTo) return recentOutreach;
    return recentOutreach.filter((r) => {
      const d = new Date(r.log.date);
      if (dateFrom && isBefore(d, startOfDay(dateFrom))) return false;
      if (dateTo && isAfter(d, endOfDay(dateTo))) return false;
      return true;
    });
  }, [recentOutreach, dateFrom, dateTo]);

  const methodDistribution = useMemo(() => {
    const counts: Record<string, number> = { call: 0, text: 0, email: 0, "in-person": 0 };
    filteredOutreach.forEach((r) => {
      if (counts[r.log.method] !== undefined) counts[r.log.method]++;
    });
    return Object.entries(counts).map(([method, count]) => ({
      method,
      count,
      label: method === "in-person" ? "In-Person" : method.charAt(0).toUpperCase() + method.slice(1),
    }));
  }, [filteredOutreach]);

  const outcomeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOutreach.forEach((r) => {
      counts[r.log.outcome] = (counts[r.log.outcome] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([outcome, count]) => ({
        outcome: outcome.replace(/_/g, " "),
        count,
      }));
  }, [filteredOutreach]);

  const totalOutreach = methodDistribution.reduce((sum, m) => sum + m.count, 0);
  const conversionRate = stats.outreachWeek > 0
    ? Math.round((stats.purchasesWeek / stats.outreachWeek) * 100)
    : 0;

  const clearDates = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Performance metrics and outreach insights
          </p>
        </div>
        {/* Date Range Picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <Popover open={fromOpen} onOpenChange={setFromOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {dateFrom ? format(dateFrom, "MMM d") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={(d) => {
                  setDateFrom(d);
                  setFromOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground text-sm">to</span>
          <Popover open={toOpen} onOpenChange={setToOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {dateTo ? format(dateTo, "MMM d") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={(d) => {
                  setDateTo(d);
                  setToOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={clearDates}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="outreach">Outreach</TabsTrigger>
          <TabsTrigger value="heat">Heat Distribution</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics with HoverCards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-default">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Clients</p>
                        <p className="text-2xl font-bold">{stats.total}</p>
                      </div>
                      <Users className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </HoverCardTrigger>
              <HoverCardContent className="w-64">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Client Breakdown</p>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active</span>
                    <span className="font-medium">{stats.active}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Inactive</span>
                    <span className="font-medium">{stats.total - stats.active}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Hot</span><span>{stats.hot}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Warm</span><span>{stats.warm}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Cold</span><span>{stats.cold}</span>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>

            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-default">
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
              </HoverCardTrigger>
              <HoverCardContent className="w-64">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Outreach Methods (7d)</p>
                  <Separator />
                  {methodDistribution.map((m) => (
                    <div key={m.method} className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{m.label}</span>
                      <span className="font-medium">{m.count}</span>
                    </div>
                  ))}
                </div>
              </HoverCardContent>
            </HoverCard>

            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-default">
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
              </HoverCardTrigger>
              <HoverCardContent className="w-64">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Conversion Funnel</p>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Outreach</span>
                    <span className="font-medium">{stats.outreachWeek}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Purchases</span>
                    <span className="font-medium text-emerald-500">{stats.purchasesWeek}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Conversion Rate</span>
                    <span className="font-medium">{conversionRate}%</span>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>

            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-default">
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
              </HoverCardTrigger>
              <HoverCardContent className="w-64">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Conversion Rate</p>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    {stats.purchasesWeek} purchase{stats.purchasesWeek !== 1 ? "s" : ""} from{" "}
                    {stats.outreachWeek} outreach attempt{stats.outreachWeek !== 1 ? "s" : ""} in the last 7 days.
                  </p>
                  <Progress value={conversionRate} className="h-2 mt-2" aria-label="Conversion rate" />
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>

          <Separator />

          {/* Heat Distribution Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5" />
                Client Heat Distribution
              </CardTitle>
              <CardDescription>
                {stats.active} active clients by engagement level
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.active > 0 ? (
                <ChartContainer config={heatChartConfig} className="h-[200px] w-full">
                  <BarChart
                    data={[
                      { level: "Hot", count: stats.hot, fill: "var(--color-hot)" },
                      { level: "Warm", count: stats.warm, fill: "var(--color-warm)" },
                      { level: "Cold", count: stats.cold, fill: "var(--color-cold)" },
                    ]}
                    layout="vertical"
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="level" width={50} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No active clients to display
                </p>
              )}
            </CardContent>
          </Card>

          {/* Conversion Metrics with Progress Bars */}
          <Card>
            <CardHeader>
              <CardTitle>Conversion Metrics (7d)</CardTitle>
              <CardDescription>Outreach effectiveness at a glance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Conversion Rate</span>
                  <span className="font-medium">{conversionRate}%</span>
                </div>
                <Progress value={conversionRate} className="h-2" aria-label="Conversion rate" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Outreach Completion</span>
                  <span className="font-medium">
                    {stats.outreachWeek > 0 ? "100%" : "0%"}
                  </span>
                </div>
                <Progress value={stats.outreachWeek > 0 ? 100 : 0} className="h-2" aria-label="Outreach completion" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Purchase Rate</span>
                  <span className="font-medium">
                    {stats.active > 0
                      ? Math.round((stats.purchasesWeek / stats.active) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    stats.active > 0
                      ? Math.round((stats.purchasesWeek / stats.active) * 100)
                      : 0
                  }
                  className="h-2"
                  aria-label="Purchase rate"
                />
              </div>
            </CardContent>
          </Card>

          {/* Compliance Cards */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Ban className="h-4 w-4 text-red-500" />
                      <p className="text-sm text-muted-foreground">Banned</p>
                    </div>
                    <p className="text-2xl font-bold text-red-500 mt-1">{stats.banned}</p>
                  </div>
                  <Link href="/banned">
                    <Button variant="ghost" size="sm">
                      View <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <MailX className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Unsubscribed</p>
                    </div>
                    <p className="text-2xl font-bold mt-1">{stats.unsubscribed}</p>
                  </div>
                  <Link href="/unsubscribed">
                    <Button variant="ghost" size="sm">
                      View <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Outreach Tab */}
        <TabsContent value="outreach" className="space-y-6">
          {/* Method Distribution Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Method Distribution</CardTitle>
              <CardDescription>
                Breakdown of {totalOutreach} outreach attempts
                {(dateFrom || dateTo) ? " (filtered)" : " (all time)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {totalOutreach > 0 ? (
                <ChartContainer config={methodChartConfig} className="h-[250px] w-full">
                  <BarChart
                    data={methodDistribution}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {methodDistribution.map((entry, index) => (
                        <Cell
                          key={entry.method}
                          fill={METHOD_COLORS[index]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No outreach data for the selected period
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Outcome Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Outcome Breakdown</CardTitle>
                <CardDescription>Results from recent outreach</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {outcomeDistribution.length > 0 ? (
                  outcomeDistribution.map(({ outcome, count }) => (
                    <div key={outcome} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm capitalize ${getOutcomeColor(outcome.replace(/ /g, "_"))}`}>
                          {outcome}
                        </span>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={totalOutreach > 0 ? (count / totalOutreach) * 100 : 0}
                            className="h-2 w-20"
                            aria-label={`${outcome} outcome`}
                          />
                          <Badge variant="secondary" className="w-8 justify-center">
                            {count}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No outreach data yet</p>
                )}
              </CardContent>
            </Card>

            {/* Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Method Share</CardTitle>
                <CardDescription>Proportional breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {totalOutreach > 0 ? (
                  <ChartContainer config={methodChartConfig} className="h-[200px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie
                        data={methodDistribution}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {methodDistribution.map((_, index) => (
                          <Cell key={index} fill={METHOD_COLORS[index]} />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No outreach data for the selected period
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Outreach Log */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Outreach</CardTitle>
                  <CardDescription>
                    {filteredOutreach.length} entr{filteredOutreach.length !== 1 ? "ies" : "y"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {filteredOutreach.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No outreach records for the selected period
                    </p>
                  ) : (
                    filteredOutreach.map((row) => (
                      <div
                        key={row.log.id}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
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
                            <Badge variant="secondary" className="text-[10px]">
                              {row.employee.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
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
              {/* Visual Stacked Bar */}
              <div className="flex rounded-lg overflow-hidden h-10">
                {stats.active > 0 ? (
                  <>
                    <div
                      className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                      style={{ width: `${(stats.hot / stats.active) * 100}%` }}
                    >
                      {stats.hot > 0 ? `${stats.hot} Hot` : ""}
                    </div>
                    <div
                      className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                      style={{ width: `${(stats.warm / stats.active) * 100}%` }}
                    >
                      {stats.warm > 0 ? `${stats.warm} Warm` : ""}
                    </div>
                    <div
                      className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                      style={{ width: `${(stats.cold / stats.active) * 100}%` }}
                    >
                      {stats.cold > 0 ? `${stats.cold} Cold` : ""}
                    </div>
                  </>
                ) : (
                  <div className="bg-muted flex-1 flex items-center justify-center text-muted-foreground text-sm">
                    No data
                  </div>
                )}
              </div>

              <Separator />

              {/* Heat Progress Bars */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-medium">Hot</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{stats.hot}</span>
                      <span className="text-xs text-muted-foreground">
                        ({stats.active > 0 ? Math.round((stats.hot / stats.active) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                  <Progress value={stats.active > 0 ? (stats.hot / stats.active) * 100 : 0} className="h-3 [&>div]:bg-orange-500" aria-label="Hot clients percentage" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium">Warm</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{stats.warm}</span>
                      <span className="text-xs text-muted-foreground">
                        ({stats.active > 0 ? Math.round((stats.warm / stats.active) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                  <Progress value={stats.active > 0 ? (stats.warm / stats.active) * 100 : 0} className="h-3 [&>div]:bg-yellow-500" aria-label="Warm clients percentage" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Snowflake className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Cold</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{stats.cold}</span>
                      <span className="text-xs text-muted-foreground">
                        ({stats.active > 0 ? Math.round((stats.cold / stats.active) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                  <Progress value={stats.active > 0 ? (stats.cold / stats.active) * 100 : 0} className="h-3 [&>div]:bg-blue-500" aria-label="Cold clients percentage" />
                </div>
              </div>

              <Separator />

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
