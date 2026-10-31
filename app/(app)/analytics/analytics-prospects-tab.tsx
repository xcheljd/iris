"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserSearch, UserCheck, XCircle, MailX, Upload, ChevronRight } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import type { ProspectFunnelStats } from "@/lib/queries";

interface AnalyticsProspectsTabProps {
  funnel: ProspectFunnelStats;
}

export function AnalyticsProspectsTab({ funnel }: AnalyticsProspectsTabProps) {
  const total = funnel.active + funnel.graduated + funnel.rejected + funnel.unsubscribed;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const graduationRate = pct(funnel.graduated);
  const rejectionRate = pct(funnel.rejected);
  const unsubRate = pct(funnel.unsubscribed);

  if (total === 0 && funnel.batches.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground text-sm py-4">
            No prospect data yet. Import prospects to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{funnel.active}</p>
              </div>
              <UserSearch className="size-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Graduated</p>
                <p className="text-2xl font-bold text-success">{funnel.graduated}</p>
                {total > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{graduationRate}% of total</p>
                )}
              </div>
              <UserCheck className="size-8 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-destructive">{funnel.rejected}</p>
                {total > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{rejectionRate}% of total</p>
                )}
              </div>
              <XCircle className="size-8 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unsubscribed</p>
                <p className="text-2xl font-bold">{funnel.unsubscribed}</p>
                {total > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{unsubRate}% of total</p>
                )}
              </div>
              <MailX className="size-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserSearch className="size-5" />
              Prospect Funnel
            </CardTitle>
            <CardDescription>{total} total prospects across all statuses</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span>Active</span>
                <span className="font-medium">{funnel.active} ({pct(funnel.active)}%)</span>
              </div>
              <Progress value={pct(funnel.active)} className="h-2" aria-label="Active prospects" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-success">Graduated</span>
                <span className="font-medium text-success">{funnel.graduated} ({graduationRate}%)</span>
              </div>
              <Progress value={graduationRate} className="h-2 [&>div]:bg-success" aria-label="Graduated prospects" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-destructive">Rejected</span>
                <span className="font-medium text-destructive">{funnel.rejected} ({rejectionRate}%)</span>
              </div>
              <Progress value={rejectionRate} className="h-2 [&>div]:bg-destructive" aria-label="Rejected prospects" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Unsubscribed</span>
                <span className="font-medium text-muted-foreground">{funnel.unsubscribed} ({unsubRate}%)</span>
              </div>
              <Progress value={unsubRate} className="h-2 [&>div]:bg-muted-foreground/50" aria-label="Unsubscribed prospects" />
            </div>
          </CardContent>
        </Card>
      )}

      {funnel.batches.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="size-5" />
                  Recent Prospect Imports
                </CardTitle>
                <CardDescription className="mt-1">
                  Last {funnel.batches.length} import batch{funnel.batches.length !== 1 ? "es" : ""}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/prospects">
                  View Prospects <ChevronRight className="size-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {funnel.batches.map((batch) => (
                <div key={batch.id} className="flex items-start justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {format(new Date(batch.createdAt), "MMM d, yyyy")}
                    </p>
                    {batch.importerName && (
                      <p className="text-xs text-muted-foreground">by {batch.importerName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{batch.importedCount} imported</Badge>
                    <span className="text-xs text-muted-foreground">of {batch.totalRows}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
