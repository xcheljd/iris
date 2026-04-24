"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MessageCircle, User, Calendar, Clock, CheckCircle, XCircle } from "lucide-react";
import { format, isToday, isAfter, isBefore } from "date-fns";
import { useClient } from "@/components/client-provider";

interface OutreachHistoryTabProps {
  client: any;
}

export function OutreachHistoryTab({ client }: OutreachHistoryTabProps) {
  const getMethodIcon = (method: string) => {
    switch (method) {
      case "call":
        return <Phone className="h-4 w-4" />;
      case "text":
        return <MessageCircle className="h-4 w-4" />;
      case "email":
        return <Mail className="h-4 w-4" />;
      case "in-person":
        return <User className="h-4 w-4" />;
      default:
        return <MessageCircle className="h-4 w-4" />;
    }
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

  const isFollowUpOverdue = (followUpDate: string | null) => {
    if (!followUpDate) return false;
    return new Date(followUpDate) < new Date();
  };

  const isFollowUpUpcoming = (followUpDate: string | null) => {
    if (!followUpDate) return false;
    const today = new Date();
    const followUp = new Date(followUpDate);
    const daysDiff = Math.ceil((followUp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= 0 && daysDiff <= 7;
  };

  const outreachLogs = client.outreach || [];

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
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
                {outreachLogs.filter((log: any) => log.outcome === "responded" || log.outcome === "purchased").length}
              </div>
              <div className="text-sm text-muted-foreground">Positive</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-blue-600">
                {outreachLogs.filter((log: any) => log.outcome === "wants_to_come_in").length}
              </div>
              <div className="text-sm text-muted-foreground">Visits Scheduled</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-red-600">
                {outreachLogs.filter((log: any) => log.outcome === "not_interested").length}
              </div>
              <div className="text-sm text-muted-foreground">Not Interested</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Outreach Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Outreach History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {outreachLogs.length > 0 ? (
            <ScrollArea className="h-[400px] w-full">
              <div className="space-y-4">
                {outreachLogs.map((log: any, index: number) => (
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
                      {getOutcomeBadge(log.outcome)}
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

                    {/* Follow-up Status */}
                    {log.followUpDate && !log.completed && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span className="text-sm">
                            Follow up: {format(new Date(log.followUpDate), "MMM d, yyyy")}
                          </span>
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
                        </div>
                        {!log.completed && (
                          <Button
                            size="sm"
                            onClick={() => {
                              // This would mark the follow-up as complete
                              alert("Mark follow-up complete");
                            }}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Complete
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No outreach history recorded</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}