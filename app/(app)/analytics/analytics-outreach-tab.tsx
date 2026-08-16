"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PaginationFooter } from "@/components/pagination-footer";
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import Link from "next/link";
import { getMethodIcon, getOutcomeColor } from "@/lib/outreach-helpers";
import { format } from "date-fns";
import { fullName } from "@/lib/utils";

const METHOD_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f97316"];

const methodChartConfig = {
  call: { label: "Call", color: "#3b82f6" },
  text: { label: "Text", color: "#22c55e" },
  email: { label: "Email", color: "#a855f7" },
  "in-person": { label: "In-Person", color: "#f97316" },
} satisfies ChartConfig;

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
    firstName: string;
    lastName: string | null;
  } | null;
}

interface MethodDistribution {
  method: string;
  count: number;
  label: string;
}

interface OutcomeDistribution {
  outcome: string;
  count: number;
}

interface AnalyticsOutreachTabProps {
  pagedOutreach: OutreachRow[];
  totalOutreach: number;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  totalFiltered: number;
  methodDistribution: MethodDistribution[];
  outcomeDistribution: OutcomeDistribution[];
  hasDateFilter: boolean;
}

export function AnalyticsOutreachTab({
  pagedOutreach,
  totalOutreach,
  page,
  setPage,
  totalPages,
  totalFiltered,
  methodDistribution,
  outcomeDistribution,
  hasDateFilter,
}: AnalyticsOutreachTabProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Method Distribution Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Method Distribution</CardTitle>
          <CardDescription>
            Breakdown of {totalOutreach} outreach attempts
            {hasDateFilter ? " (filtered)" : " (all time)"}
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
          <CardContent className="flex flex-col gap-3">
            {outcomeDistribution.length > 0 ? (
              outcomeDistribution.map(({ outcome, count }) => (
                <div key={outcome} className="flex flex-col gap-1">
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
                {totalFiltered} entr{totalFiltered !== 1 ? "ies" : "y"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {totalFiltered === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No outreach records for the selected period
              </p>
            ) : (
              pagedOutreach.map((row) => (
                <div
                  key={row.log.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getMethodIcon(row.log.method, "size-3.5")}
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
                        {row.employee ? fullName(row.employee) : ""}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <PaginationFooter
            currentPage={page}
            totalPages={totalPages}
            onPageChangeAction={setPage}
            totalItems={totalFiltered}
            pageSize={20}
            itemLabel="records"
          />
        </CardContent>
      </Card>
    </div>
  );
}
