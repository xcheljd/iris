"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Calendar, Clock, CheckCircle, ChevronDown, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { DatePicker } from "@/components/date-picker";
import type { FullClient } from "@/components/client-provider";
import type { OutreachLog } from "@/lib/db/schema";
import { getMethodIcon, isFollowUpOverdue, isFollowUpUpcoming } from "@/lib/outreach-helpers";
import { markFollowUpComplete, rescheduleFollowUp } from "@/lib/actions";
import { OutreachLogger } from "@/components/outreach-logger";

const PAGE_SIZE = 10;

interface OutreachHistoryTabProps {
  client: FullClient;
}

export function OutreachHistoryTab({ client }: OutreachHistoryTabProps) {
  const [isPending, startTransition] = useTransition();

  const handleComplete = (logId: string) => {
    startTransition(async () => {
      try {
        await markFollowUpComplete(logId);
        toast.success("Follow-up marked complete");
      } catch {
        toast.error("Failed to mark complete");
      }
    });
  };

  const handleReschedule = (logId: string, date: Date) => {
    startTransition(async () => {
      try {
        await rescheduleFollowUp(logId, format(date, "yyyy-MM-dd"));
        toast.success(`Follow-up rescheduled to ${format(date, "MMM d, yyyy")}`);
      } catch {
        toast.error("Failed to reschedule follow-up");
      }
    });
  };

  const getOutcomeBadge = (outcome: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "responded": "default",
      "wants_to_come_in": "default",
      "purchased": "default",
      "no_answer": "secondary",
      "voicemail": "secondary",
      "voicemail_full": "secondary",
      "not_interested": "destructive",
    };

    const labels: Record<string, string> = {
      "responded": "Responded",
      "wants_to_come_in": "Wants to visit",
      "purchased": "Purchased",
      "no_answer": "No answer",
      "voicemail": "Voicemail",
      "voicemail_full": "Voicemail full",
      "not_interested": "Not interested",
    };

    return (
      <Badge variant={variants[outcome] || "outline"}>
        {labels[outcome] || outcome.replace(/_/g, " ")}
      </Badge>
    );
  };

  const outreachLogs: OutreachLog[] = client.outreach || [];
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleLogs = outreachLogs.slice(0, visibleCount);
  const hasMore = visibleCount < outreachLogs.length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{outreachLogs.length}</div>
              <div className="text-sm text-muted-foreground">Total Outreach</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-green-600">
                {outreachLogs.filter((log: OutreachLog) => log.outcome === "responded" || log.outcome === "purchased").length}
              </div>
              <div className="text-sm text-muted-foreground">Positive</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-blue-600">
                {outreachLogs.filter((log: OutreachLog) => log.outcome === "wants_to_come_in").length}
              </div>
              <div className="text-sm text-muted-foreground">Visits Scheduled</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-red-600">
                {outreachLogs.filter((log: OutreachLog) => log.outcome === "not_interested").length}
              </div>
              <div className="text-sm text-muted-foreground">Not Interested</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-5" />
              Outreach History
            </CardTitle>
            <OutreachLogger
              clientId={client.id}
              clientName={`${client.firstName} ${client.lastName}`}
              trigger={
                <Button variant="gold" size="sm">
                  <Phone className="size-3.5 mr-1.5" />
                  Log Outreach
                </Button>
              }
            />
          </div>
        </CardHeader>
        <CardContent>
          {outreachLogs.length > 0 ? (
            <div className="space-y-4">
              <div className="divide-y">
                {visibleLogs.map((log: OutreachLog) => (
                  <div key={log.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {getMethodIcon(log.method)}
                        <span className="font-medium capitalize">{log.method}</span>
                        <span>•</span>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(log.date), "MMM d, yyyy")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getOutcomeBadge(log.outcome)}
                        <OutreachLogger
                          key={`relog-${log.id}`}
                          clientId={client.id}
                          clientName={`${client.firstName} ${client.lastName}`}
                          defaultMethod={log.method as "call" | "text" | "email" | "in-person"}
                          trigger={
                            <Button variant="ghost" size="sm" title="Log another outreach with this method">
                              <RotateCcw className="size-3.5 mr-1" />
                              Re-log
                            </Button>
                          }
                        />
                      </div>
                    </div>

                    {log.purchasedModel && (
                      <div className="bg-green-50 border border-green-200 rounded p-2 mb-3">
                        <div className="text-sm font-medium text-green-800">Purchase</div>
                        <div className="text-sm text-green-700">{log.purchasedModel}</div>
                      </div>
                    )}

                    {log.notes && (
                      <div className="mb-3">
                        <div className="text-sm text-muted-foreground mb-1">Notes</div>
                        <div className="text-sm bg-muted/50 rounded p-2">
                          {log.notes}
                        </div>
                      </div>
                    )}

                    {log.followUpDate && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          {log.completed ? (
                            <CheckCircle className="size-4 text-green-600" />
                          ) : (
                            <Calendar className="size-4" />
                          )}
                          <span className={`text-sm ${log.completed ? "text-muted-foreground line-through" : ""}`}>
                            Follow up: {format(new Date(log.followUpDate), "MMM d, yyyy")}
                          </span>
                          {log.completed ? (
                            <Badge variant="outline" className="text-xs border-green-600/40 text-green-700">
                              Completed
                            </Badge>
                          ) : (
                            <>
                              {isFollowUpOverdue(log.followUpDate) && (
                                <Badge variant="destructive" className="text-xs">
                                  Overdue
                                </Badge>
                              )}
                              {isFollowUpUpcoming(log.followUpDate) && (
                                <Badge variant="secondary" className="text-xs">
                                  Upcoming
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                        {!log.completed && (
                          <div className="flex items-center gap-2">
                            <DatePicker
                              date={new Date(log.followUpDate)}
                              onSelectAction={(d) => d && handleReschedule(log.id, d)}
                              disabled={isPending}
                            />
                            <Button
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleComplete(log.id)}
                            >
                              <CheckCircle className="size-4 mr-1" />
                              {isPending ? "Saving…" : "Complete"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  >
                    <ChevronDown className="size-4 mr-1" />
                    Load more ({outreachLogs.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                {outreachLogs.length} outreach record{outreachLogs.length !== 1 ? "s" : ""}
              </p>
            </div>
          ) : (
            <EmptyState
              icon={Phone}
              title="No outreach history recorded"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
