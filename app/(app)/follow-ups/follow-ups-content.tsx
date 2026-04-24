"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Phone, 
  MessageCircle, 
  Mail, 
  User, 
  Calendar,
  ChevronRight,
  Filter
} from "lucide-react";
import Link from "next/link";
import { markFollowUpComplete } from "@/lib/actions";
import { toast } from "sonner";
import { format } from "date-fns";

interface FollowUpRow {
  log: {
    id: string;
    method: string;
    date: Date;
    outcome: string;
    notes: string | null;
    followUpDate: Date | null;
    completed: boolean;
  };
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    email: string | null;
    heatScore: number;
    heatLevel: string;
  } | null;
  employee: {
    name: string;
  } | null;
}

interface FollowUpsContentProps {
  overdue: FollowUpRow[];
  upcoming: FollowUpRow[];
}

function getMethodIcon(method: string) {
  switch (method) {
    case "call": return <Phone className="h-4 w-4" />;
    case "text": return <MessageCircle className="h-4 w-4" />;
    case "email": return <Mail className="h-4 w-4" />;
    case "in-person": return <User className="h-4 w-4" />;
    default: return <MessageCircle className="h-4 w-4" />;
  }
}

function getMethodColor(method: string) {
  switch (method) {
    case "call": return "bg-green-500/10 text-green-500 border-green-500/20";
    case "text": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "email": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case "in-person": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    default: return "bg-muted text-muted-foreground border-muted";
  }
}

function getOutcomeColor(outcome: string) {
  switch (outcome) {
    case "no_answer": return "text-muted-foreground";
    case "voicemail": return "text-yellow-500";
    case "voicemail_full": return "text-red-500";
    case "responded": return "text-green-500";
    case "not_interested": return "text-red-500";
    case "wants_to_come_in": return "text-green-500";
    case "purchased": return "text-emerald-500";
    default: return "text-muted-foreground";
  }
}

function getHeatColor(level: string) {
  switch (level) {
    case "hot": return "text-orange-500";
    case "warm": return "text-yellow-500";
    case "cold": return "text-blue-500";
    default: return "text-muted-foreground";
  }
}

function FollowUpCard({ row, isOverdue }: { row: FollowUpRow; isOverdue: boolean }) {
  const [isCompleting, setIsCompleting] = useState(false);

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await markFollowUpComplete(row.log.id);
      toast.success("Follow-up marked complete");
    } catch {
      toast.error("Failed to complete follow-up");
    } finally {
      setIsCompleting(false);
    }
  };

  if (!row.client) return null;

  return (
    <Card className={isOverdue ? "border-red-200 dark:border-red-900" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link 
                href={`/clients/${row.client.id}`}
                className="font-medium hover:underline truncate"
              >
                {row.client.firstName} {row.client.lastName || ""}
              </Link>
              {isOverdue && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  OVERDUE
                </Badge>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mb-2">
              {row.client.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {row.client.phone}
                </span>
              )}
              <span className={`flex items-center gap-1 ${getHeatColor(row.client.heatLevel)}`}>
                <span className="text-xs font-medium">🔥 {row.client.heatScore}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={getMethodColor(row.log.method)}>
                {getMethodIcon(row.log.method)}
                <span className="ml-1 capitalize text-xs">{row.log.method}</span>
              </Badge>
              <span className={`text-xs capitalize ${getOutcomeColor(row.log.outcome)}`}>
                {row.log.outcome.replace(/_/g, " ")}
              </span>
            </div>

            {row.log.notes && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {row.log.notes}
              </p>
            )}

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {row.log.followUpDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(row.log.followUpDate), "MMM d, yyyy")}
                </span>
              )}
              {row.employee && (
                <span>via {row.employee.name}</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/clients/${row.client.id}`}>
                View <ChevronRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
            <Button size="sm" variant="default" onClick={handleComplete} disabled={isCompleting}>
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Done
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function FollowUpsContent({ overdue, upcoming }: FollowUpsContentProps) {
  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Follow-Ups</h1>
        <p className="text-muted-foreground mt-1">
          Track pending outreach and follow-up tasks
        </p>
      </div>

      <Tabs defaultValue="overdue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overdue" className="gap-1">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Overdue
            {overdue.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">
                {overdue.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="gap-1">
            <Clock className="h-4 w-4" />
            Upcoming (7 days)
            {upcoming.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {upcoming.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overdue">
          {overdue.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
                <h3 className="text-lg font-medium">All caught up!</h3>
                <p className="text-muted-foreground mt-1">No overdue follow-ups right now.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {overdue.map((row) => (
                <FollowUpCard key={row.log.id} row={row} isOverdue />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="upcoming">
          {upcoming.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="text-lg font-medium">No upcoming follow-ups</h3>
                <p className="text-muted-foreground mt-1">
                  Follow-ups scheduled in the next 7 days will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {upcoming.map((row) => (
                <FollowUpCard key={row.log.id} row={row} isOverdue={false} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}