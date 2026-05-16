"use client";

import { useClient } from "@/components/client-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tag, Copy, Calendar, Plus, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { OutreachLogger } from "@/components/outreach-logger";
import { isFollowUpOverdue, isFollowUpUpcoming } from "@/lib/outreach-helpers";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ClientSidebar() {
  const client = useClient();

  if (!client) return null;

  const handleCopy = async (text: string, type: "phone" | "email") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${type} to clipboard`);
    } catch (error) {
      toast.error(`Failed to copy ${type}`, {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Soonest pending follow-up (earliest date, including overdue ones).
  const nextFollowUp = client.followUps
    .filter((fu) => fu.followUpDate)
    .sort(
      (a, b) =>
        new Date(a.followUpDate!).getTime() - new Date(b.followUpDate!).getTime()
    )[0];

  return (
    <div className="p-4 space-y-4">
      {/* Quick Profile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {client.firstName} {client.lastName}
          </CardTitle>
          <Badge variant={client.heatLevel === "hot" ? "destructive" : client.heatLevel === "warm" ? "default" : "secondary"}>
            {client.heatLevel.toUpperCase()}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {client.phone && (
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{client.phone}</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleCopy(client.phone!, "phone")}
                    aria-label="Copy phone number"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy phone number</TooltipContent>
              </Tooltip>
            </div>
          )}
          {client.email && (
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{client.email}</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleCopy(client.email!, "email")}
                    aria-label="Copy email address"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy email address</TooltipContent>
              </Tooltip>
            </div>
          )}
          <div className="text-sm">
            <span className="text-muted-foreground">Added: </span>
            {format(new Date(client.dateAdded), "MMM d, yyyy")}
          </div>
        </CardContent>
      </Card>

      {/* Follow-up Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {client.followUps.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Active follow-ups: {client.followUps.length}
              </div>
              {nextFollowUp && (
                <div className="p-2 bg-accent rounded space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">Next</div>
                    {isFollowUpOverdue(nextFollowUp.followUpDate!) ? (
                      <Badge variant="destructive" className="text-xs">Overdue</Badge>
                    ) : isFollowUpUpcoming(nextFollowUp.followUpDate!) ? (
                      <Badge variant="secondary" className="text-xs">Upcoming</Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(nextFollowUp.followUpDate!), "MMM d, yyyy")}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-1">
              No scheduled follow-ups
              <OutreachLogger
                clientId={client.id}
                clientName={`${client.firstName} ${client.lastName}`}
                trigger={
                  <Button variant="outline" size="sm" className="w-full mt-2">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Schedule One
                  </Button>
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tags
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {client.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No tags</div>
          )}
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Separator />
      <div className="space-y-2 text-sm">
        <div><span className="text-muted-foreground">Employee:</span> {client.employeeName || "Unassigned"}</div>
        <div><span className="text-muted-foreground">Email List:</span> {client.onEmailList ? "Yes" : "No"}</div>
        <div><span className="text-muted-foreground">Status:</span> {client.status}</div>
        <div><span className="text-muted-foreground">Source:</span> {client.source}</div>
      </div>
    </div>
  );
}