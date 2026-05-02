"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Users,
  Flame,
  Phone,
  Target,
  ShoppingCart,
  MailX,
  Ban,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

const heatChartConfig = {
  hot: { label: "Hot", color: "#f97316" },
  warm: { label: "Warm", color: "#eab308" },
  cold: { label: "Cold", color: "#3b82f6" },
} satisfies ChartConfig;

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

interface MethodDistribution {
  method: string;
  count: number;
  label: string;
}

interface AnalyticsOverviewTabProps {
  stats: Stats;
  conversionRate: number;
  methodDistribution: MethodDistribution[];
}

export function AnalyticsOverviewTab({ stats, conversionRate, methodDistribution }: AnalyticsOverviewTabProps) {
  return (
    <div className="space-y-6">
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
    </div>
  );
}
