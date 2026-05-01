"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Clock,
  Tag, 
  UserPlus, 
  Edit3, 
  ArrowRightLeft,
  Archive, 
  ShoppingCart,
  MessageSquare,
  Merge
} from "lucide-react";
import { format } from "date-fns";
import type { FullClient } from "@/components/client-provider";
import type { ActivityEvent } from "@/lib/db/schema";

type ActivityEventWithName = ActivityEvent & { employeeName?: string | null };

interface ActivityTimelineTabProps {
  client: FullClient;
}

export function ActivityTimelineTab({ client }: ActivityTimelineTabProps) {
  const getEventTypeIcon = (eventType: string) => {
    const iconMap: Record<string, JSX.Element> = {
      "created": <UserPlus className="h-4 w-4" />,
      "edited": <Edit3 className="h-4 w-4" />,
      "outreach_logged": <MessageSquare className="h-4 w-4" />,
      "purchase": <ShoppingCart className="h-4 w-4" />,
      "tag_added": <Tag className="h-4 w-4" />,
      "tag_removed": <Tag className="h-4 w-4" />,
      "transferred": <ArrowRightLeft className="h-4 w-4" />,
      "status_changed": <Archive className="h-4 w-4" />,
      "note_added": <MessageSquare className="h-4 w-4" />,
      "merged": <Merge className="h-4 w-4" />,
    };
    return iconMap[eventType] || <Calendar className="h-4 w-4" />;
  };

  const getEventTypeBadge = (eventType: string) => {
    const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "created": "default",
      "edited": "secondary",
      "outreach_logged": "default",
      "purchase": "default",
      "tag_added": "secondary",
      "tag_removed": "secondary",
      "transferred": "outline",
      "status_changed": "destructive",
      "note_added": "secondary",
      "merged": "outline",
    };
    return variantMap[eventType] || "outline";
  };

  const formatEventDescription = (event: ActivityEventWithName) => {
    const { eventType, description, metadata } = event;

    switch (eventType) {
      case "created":
        return `Client added by ${event.employeeName || "system"}`;
      
      case "edited":
        if (metadata?.fieldChanges) {
          const changes = Object.entries(metadata.fieldChanges as Record<string, unknown>)
            .map(([field]) => {
              const fieldLabels: Record<string, string> = {
                firstName: "First name",
                lastName: "Last name",
                phone: "Phone",
                email: "Email",
                birthday: "Birthday",
                anniversary: "Anniversary",
                source: "Source",
                status: "Status",
                onEmailList: "Email list",
              };
              return `${fieldLabels[field] || field} changed`;
            })
            .join(", ");
          return `Profile updated: ${changes}`;
        }
        return description;
      
      case "outreach_logged":
        return `${(metadata?.method as string) || "outreach"} — ${String(metadata?.outcome || "logged").replace(/_/g, " ")}`;
      
      case "purchase":
        return `Purchase: ${(metadata?.purchasedModel as string) || "Product"}`;
      
      case "tag_added":
        return `Tag added: ${(metadata?.tagName as string) || "Tag"}`;
      
      case "tag_removed":
        return `Tag removed: ${(metadata?.tagName as string) || "Tag"}`;
      
      case "transferred":
        return `Transferred to ${(metadata?.newEmployeeName as string) || "another associate"}`;
      
      case "status_changed":
        return `Status changed to: ${(metadata?.newStatus as string) || event.description.split(": ")[1]}`;
      
      case "note_added":
        return `Note added: ${(metadata?.notePreview as string) || "New note"}`;
      
      case "merged":
        return `Merged from ${(metadata?.sourceClientId as string) || "another record"}`;
      
      default:
        return description;
    }
  };

  const timelineEvents = ([...client.timeline] as ActivityEventWithName[]).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold">{timelineEvents.length}</div>
                <div className="text-sm text-muted-foreground">Total Events</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold">
                  {timelineEvents.filter((e) => e.eventType === "purchase").length}
                </div>
                <div className="text-sm text-muted-foreground">Purchases</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-600" />
              <div>
                <div className="text-2xl font-bold">
                  {timelineEvents.filter((e) => e.eventType === "outreach_logged").length}
                </div>
                <div className="text-sm text-muted-foreground">Outreach</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] w-full">
            <div className="space-y-4">
              {timelineEvents.map((event) => (
                <div key={event.id} className="flex gap-4">
                  {/* Timeline Line */}
                  <div className="flex flex-col items-center">
                    <div className="w-0.5 h-full bg-border" />
                    <div className="w-4 h-4 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                      {getEventTypeIcon(event.eventType)}
                    </div>
                  </div>

                  {/* Event Content */}
                  <div className="flex-1 min-w-0 pb-6">
                    <div className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={getEventTypeBadge(event.eventType)}>
                            {event.eventType.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(event.createdAt), "MMM d, yyyy • h:mm a")}
                          </span>
                        </div>
                        {event.employeeName && (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {event.employeeName.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">
                              {event.employeeName}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-2">
                        <p className="text-sm">{formatEventDescription(event)}</p>
                      </div>

                      {event.metadata && Object.keys(event.metadata).length > 0 && event.eventType !== "status_changed" && (
                        <div className="mt-3 p-2 bg-muted/50 rounded text-xs">
                          <div className="font-medium mb-1">Details:</div>
                          {Object.entries(event.metadata).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-muted-foreground">{key}:</span>
                              <span>{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
