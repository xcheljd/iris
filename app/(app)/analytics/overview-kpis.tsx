"use client";

// Analytics Overview KPIs. Desktop and tablet: four cards, each with a small
// visual (split bar or ring) and a trend badge against the previous period.
// Phones: one compact list card. Every breakdown is printed, never hover-only.

import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer } from "@/components/ui/chart";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { CalendarCheck, ChevronRight, Minus, Phone, Target, TrendingDown, TrendingUp, Users } from "lucide-react";
import type { KpiMetrics } from "@/lib/queries";
import { percent } from "@/lib/kpi";

export interface OverviewKpisProps {
  kpis: KpiMetrics;
  total: number;
  active: number;
  methods: { method: string; label: string; count: number }[];
  /** "Last 30 days", "May 1 – May 31, 2026", "all time". */
  inRange: string;
}

const METHOD_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function derive(kpis: KpiMetrics) {
  const conversion = percent(kpis.bought, kpis.contacted);
  const completion = percent(kpis.followUpsDone, kpis.followUpsDue);
  const p = kpis.prev;
  return {
    conversion,
    completion,
    // Rates compare in percentage points, counts in percent. No badge when
    // there is no previous period or it had nothing to compare against.
    conversionDelta: p && p.contacted > 0 ? conversion - percent(p.bought, p.contacted) : null,
    completionDelta: p && p.followUpsDue > 0 ? completion - percent(p.followUpsDone, p.followUpsDue) : null,
    outreachDelta: p && p.outreach > 0 ? Math.round(((kpis.outreach - p.outreach) / p.outreach) * 100) : null,
  };
}

function Trend({ value, unit, what }: { value: number | null; unit: "%" | " pts"; what: string }) {
  if (value === null) return null;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const signed = `${value > 0 ? "+" : ""}${value}${unit}`;
  return (
    <Badge variant="outline" className="tabular-nums" aria-label={`${what} ${signed} versus the previous period`}>
      <Icon aria-hidden />
      {signed}
    </Badge>
  );
}

/** The follow-ups to-do: a red link to the Follow-Ups page (opens on Overdue). */
function OverdueLink({ n }: { n: number }) {
  if (n === 0) return <span className="text-muted-foreground">Nothing overdue</span>;
  return (
    <Link
      href="/follow-ups"
      className="-mx-1.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium whitespace-nowrap text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      {n} overdue now <ChevronRight className="size-4" aria-hidden />
    </Link>
  );
}

function MiniRing({ value, color }: { value: number; color: string }) {
  return (
    <ChartContainer config={{ v: { label: "v", color } }} className="aspect-square size-14 shrink-0" aria-hidden>
      <RadialBarChart data={[{ v: value, fill: color }]} startAngle={90} endAngle={-270} innerRadius={20} outerRadius={28}>
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <RadialBar
          dataKey="v"
          background={{ fill: "color-mix(in srgb, var(--muted-foreground) 25%, transparent)" }}
          cornerRadius={6}
          isAnimationActive={false}
        />
      </RadialBarChart>
    </ChartContainer>
  );
}

function SplitBar({ parts }: { parts: { key: string; n: number; color: string }[] }) {
  const sum = parts.reduce((a, p) => a + p.n, 0);
  if (sum === 0) return <div className="h-2 w-full rounded-full bg-muted" aria-hidden />;
  return (
    <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
      {parts.map((p) => p.n > 0 && (
        <div key={p.key} style={{ width: `${(p.n / sum) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

function KpiCard({ label, value, trend, visual, children }: {
  label: string; value: string; trend?: React.ReactNode; visual?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col bg-gradient-to-t from-primary/5 to-card dark:bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardDescription>{label}</CardDescription>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
            {trend}
          </div>
        </div>
        {visual}
      </CardHeader>
      <CardFooter className="mt-auto flex-col items-stretch gap-1.5 text-sm">{children}</CardFooter>
    </Card>
  );
}

function KpiCards({ kpis, total, active, methods, inRange }: OverviewKpisProps) {
  const d = derive(kpis);
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <KpiCard label="Total Clients" value={String(total)}>
        <SplitBar parts={[
          { key: "active", n: active, color: "var(--chart-2)" },
          { key: "inactive", n: total - active, color: "var(--muted-foreground)" },
        ]} />
        <div className="flex justify-between gap-2 tabular-nums">
          <span className="font-medium">{active} active</span>
          <span className="text-muted-foreground">{total - active} inactive</span>
        </div>
        <div className="text-muted-foreground">Right now</div>
      </KpiCard>

      <KpiCard label="Outreach" value={String(kpis.outreach)} trend={<Trend value={d.outreachDelta} unit="%" what="Outreach" />}>
        <SplitBar parts={methods.map((m, i) => ({ key: m.method, n: m.count, color: METHOD_COLORS[i % METHOD_COLORS.length] }))} />
        <ul aria-label="Outreach by method" className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
          {methods.map((m, i) => (
            <li key={m.method} className="flex items-center gap-1 whitespace-nowrap">
              <span className="size-2 rounded-full" style={{ background: METHOD_COLORS[i % METHOD_COLORS.length] }} aria-hidden />
              <span className="text-muted-foreground">{m.label}</span> <span className="font-medium">{m.count}</span>
            </li>
          ))}
        </ul>
        <div className="text-muted-foreground">{inRange}</div>
      </KpiCard>

      <KpiCard
        label="Conversion"
        value={`${d.conversion}%`}
        trend={<Trend value={d.conversionDelta} unit=" pts" what="Conversion" />}
        visual={<MiniRing value={d.conversion} color="var(--success)" />}
      >
        <div className="font-medium tabular-nums">{kpis.bought} of {kpis.contacted} clients contacted bought</div>
        <div className="text-muted-foreground">{inRange}</div>
      </KpiCard>

      <KpiCard
        label="Follow-ups done"
        value={`${d.completion}%`}
        trend={<Trend value={d.completionDelta} unit=" pts" what="Follow-ups done" />}
        visual={<MiniRing value={d.completion} color="var(--info)" />}
      >
        <div className="font-medium tabular-nums">{kpis.followUpsDone} of {kpis.followUpsDue} due</div>
        <div><OverdueLink n={kpis.overdueNow} /></div>
        <div className="text-muted-foreground">{inRange}</div>
      </KpiCard>
    </div>
  );
}

function KpiList({ kpis, total, active, methods, inRange }: OverviewKpisProps) {
  const d = derive(kpis);
  const rows: { icon: typeof Users; title: string; desc: React.ReactNode; value: string; trend: React.ReactNode }[] = [
    {
      icon: Users, title: "Total Clients", value: String(total), trend: null,
      desc: `${active} active · ${total - active} inactive`,
    },
    {
      icon: Phone, title: "Outreach", value: String(kpis.outreach),
      trend: <Trend value={d.outreachDelta} unit="%" what="Outreach" />,
      desc: (
        // Each item carries its "·" in front; the dot of an item that starts a
        // line falls in the clipped negative margin, so no dot ever dangles.
        <span className="block overflow-hidden">
          <span className="-ml-3 flex flex-wrap">
            {methods.map((m) => (
              <span key={m.method} className="relative whitespace-nowrap pl-3 before:absolute before:left-1 before:content-['·']">
                {m.label} {m.count}
              </span>
            ))}
          </span>
        </span>
      ),
    },
    {
      icon: Target, title: "Conversion", value: `${d.conversion}%`,
      trend: <Trend value={d.conversionDelta} unit=" pts" what="Conversion" />,
      desc: `${kpis.bought} of ${kpis.contacted} contacted bought`,
    },
    {
      icon: CalendarCheck, title: "Follow-ups done", value: `${d.completion}%`,
      trend: <Trend value={d.completionDelta} unit=" pts" what="Follow-ups done" />,
      desc: <><span className="whitespace-nowrap">{kpis.followUpsDone} of {kpis.followUpsDue} due</span><br /><OverdueLink n={kpis.overdueNow} /></>,
    },
  ];
  return (
    <Card className="py-0">
      <CardHeader className="pb-2">
        <CardTitle>Key metrics</CardTitle>
        <CardDescription>{inRange}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <ItemGroup>
          {rows.map((r, i) => (
            <div key={r.title}>
              {i > 0 && <ItemSeparator />}
              <Item size="sm">
                <ItemMedia variant="icon"><r.icon /></ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle>{r.title}</ItemTitle>
                  <ItemDescription className="line-clamp-none tabular-nums">{r.desc}</ItemDescription>
                </ItemContent>
                <ItemActions className="flex-col items-end gap-1">
                  <span className="text-xl font-bold tabular-nums">{r.value}</span>
                  {r.trend}
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}

export function OverviewKpis(props: OverviewKpisProps) {
  return (
    <>
      <div className="max-md:hidden"><KpiCards {...props} /></div>
      <div className="md:hidden"><KpiList {...props} /></div>
    </>
  );
}
