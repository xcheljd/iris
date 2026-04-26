"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  CalendarClock,
  Timer,
  Eye,
  Flame,
} from "lucide-react";
import Link from "next/link";
import { markFollowUpComplete, rescheduleFollowUp } from "@/lib/actions";
import { toast } from "sonner";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";

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

function getMethodBadgeVariant(method: string) {
  switch (method) {
    case "call": return "bg-green-500/10 text-green-500 border-green-500/20";
    case "text": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "email": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
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

function getHeatBadge(level: string) {
  switch (level) {
    case "hot": return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-xs">Hot</Badge>;
    case "warm": return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-xs">Warm</Badge>;
    case "cold": return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">Cold</Badge>;
    default: return null;
  }
}

function getRelativeTime(date: Date) {
  const now = new Date();
  const diff = differenceInDays(now, date);
  if (diff > 0) return `${diff} day${diff !== 1 ? "s" : ""} overdue`;
  if (diff === 0) return "Due today";
  return `In ${Math.abs(diff)} day${Math.abs(diff) !== 1 ? "s" : ""}`;
}

function FollowUpCard({ row, isOverdue, onDetail }: { row: FollowUpRow; isOverdue: boolean; onDetail: () => void }) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState("");

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

  const handleReschedule = async () => {
    if (!newDate) return;
    try {
      await rescheduleFollowUp(row.log.id, newDate);
      toast.success("Follow-up rescheduled");
      setRescheduleOpen(false);
    } catch {
      toast.error("Failed to reschedule");
    }
  };

  const handleSnooze = async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];
    try {
      await rescheduleFollowUp(row.log.id, dateStr);
      toast.success("Follow-up snoozed until tomorrow");
    } catch {
      toast.error("Failed to snooze");
    }
  };

  if (!row.client) return null;

  return (
    <>
      <Card className={isOverdue ? "border-red-200 dark:border-red-900" : ""}>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link
                href={`/clients/${row.client.id}`}
                className="font-medium hover:underline"
              >
                {row.client.firstName} {row.client.lastName || ""}
              </Link>
              {isOverdue && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  OVERDUE
                </Badge>
              )}
              {getHeatBadge(row.client.heatLevel)}
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={getMethodBadgeVariant(row.log.method)}>
                {getMethodIcon(row.log.method)}
                <span className="ml-1 capitalize text-xs">{row.log.method}</span>
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {row.client.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {row.client.phone}
                  </span>
                )}
                <span className={`text-xs capitalize ${getOutcomeColor(row.log.outcome)}`}>
                  {row.log.outcome.replace(/_/g, " ")}
                </span>
              </div>

              {row.log.notes && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {row.log.notes}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {row.log.followUpDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(row.log.followUpDate), "MMM d, yyyy")}
                    <span className={isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}>
                      ({getRelativeTime(new Date(row.log.followUpDate))})
                    </span>
                  </span>
                )}
                {row.employee && (
                  <span>via {row.employee.name}</span>
                )}
              </div>
            </div>

            <div className="flex flex-row sm:flex-col gap-1.5 shrink-0 flex-wrap">
              <Button size="sm" variant="ghost" onClick={onDetail} className="h-7 text-xs gap-1">
                <Eye className="h-3 w-3" />
                Detail
              </Button>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={handleSnooze} className="h-7 text-xs gap-1">
                  <Timer className="h-3 w-3" />
                  Snooze
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 3);
                  setNewDate(d.toISOString().split("T")[0]);
                  setRescheduleOpen(true);
                }} className="h-7 text-xs gap-1">
                  <CalendarClock className="h-3 w-3" />
                  Reschedule
                </Button>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="default" disabled={isCompleting} className="h-7 text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Done
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Mark follow-up as done?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the follow-up with {row.client.firstName} {row.client.lastName || ""} as completed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleComplete}>Confirm</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule Follow-Up</DialogTitle>
            <DialogDescription>
              Pick a new date for the follow-up with {row.client.firstName} {row.client.lastName || ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="reschedule-date">New Date</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            <Button onClick={handleReschedule} disabled={!newDate}>Reschedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FollowUpDetailSheet({ row, open, onOpenChange }: { row: FollowUpRow | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!row || !row.client) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row.client.firstName} {row.client.lastName || ""}</SheetTitle>
          <SheetDescription>Follow-up details</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Contact</p>
              {row.client.phone && <p className="text-sm">{row.client.phone}</p>}
              {row.client.email && <p className="text-sm">{row.client.email}</p>}
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Method</p>
              <Badge variant="outline" className={getMethodBadgeVariant(row.log.method)}>
                {getMethodIcon(row.log.method)}
                <span className="ml-1 capitalize">{row.log.method}</span>
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Outcome</p>
              <p className={`text-sm capitalize ${getOutcomeColor(row.log.outcome)}`}>
                {row.log.outcome.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Heat</p>
              <div className="flex items-center gap-2">
                {getHeatBadge(row.client.heatLevel)}
                <span className="text-sm"><Flame className="h-4 w-4 inline" /> {row.client.heatScore}</span>
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notes</p>
              <p className="text-sm">{row.log.notes || "No notes"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Follow-up Date</p>
              <p className="text-sm">
                {row.log.followUpDate
                  ? format(new Date(row.log.followUpDate), "MMMM d, yyyy")
                  : "Not set"}
              </p>
            </div>
            {row.employee && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Assigned To</p>
                <p className="text-sm">{row.employee.name}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Logged</p>
              <p className="text-sm">{format(new Date(row.log.date), "MMMM d, yyyy 'at' h:mm a")}</p>
            </div>
          </div>
          <Separator />
          <div className="flex gap-2">
            <Button asChild className="flex-1">
              <Link href={`/clients/${row.client.id}`}>
                View Client <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function FollowUpsContent({ overdue, upcoming }: FollowUpsContentProps) {
  const [selectedRow, setSelectedRow] = useState<FollowUpRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const all = [...overdue, ...upcoming];
  const uniqueAll = all.filter((row, i, arr) => arr.findIndex((r) => r.log.id === row.log.id) === i);

  const openDetail = (row: FollowUpRow) => {
    setSelectedRow(row);
    setDetailOpen(true);
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Follow-Ups</h1>
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
          <TabsTrigger value="all" className="gap-1">
            All
            <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
              {uniqueAll.length}
            </Badge>
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
                <FollowUpCard key={row.log.id} row={row} isOverdue onDetail={() => openDetail(row)} />
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
                <FollowUpCard key={row.log.id} row={row} isOverdue={false} onDetail={() => openDetail(row)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all">
          {uniqueAll.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
                <h3 className="text-lg font-medium">No follow-ups</h3>
                <p className="text-muted-foreground mt-1">All follow-ups have been completed.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {uniqueAll.map((row) => {
                const isOverdue = row.log.followUpDate
                  ? new Date(row.log.followUpDate) <= new Date()
                  : false;
                return (
                  <FollowUpCard key={row.log.id} row={row} isOverdue={isOverdue} onDetail={() => openDetail(row)} />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <FollowUpDetailSheet
        row={selectedRow}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
