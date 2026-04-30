"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, Mail, MapPin, Gift, Briefcase, Users } from "lucide-react";
import { format } from "date-fns";
import { useClient, useActiveTab } from "@/components/client-provider";
import { ProfileTab } from "@/components/profile-tab";
import { InterestsTab } from "@/components/interests-tab";
import { OutreachHistoryTab } from "@/components/outreach-history-tab";
import { ActivityTimelineTab } from "@/components/activity-timeline-tab";
import { NotesTab } from "@/components/notes-tab";
import { TagsTab } from "@/components/tags-tab";
import { HeatScoreBar } from "@/components/heat-score-bar";

export function ClientDetailTabs() {
  const client = useClient();
  const { activeTab, setActiveTab } = useActiveTab();
  if (!client) return null;

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
        <Avatar className="h-14 w-14 text-lg">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {client.firstName?.[0]}{client.lastName?.[0]}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {client.firstName} {client.lastName}
          </h1>
          {client.customerId && (
            <p className="text-sm font-mono text-muted-foreground">#{client.customerId}</p>
          )}
          <p className="text-muted-foreground mt-0.5">
            Added {format(new Date(client.dateAdded), "MMMM d, yyyy")}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <HeatScoreBar score={client.heatScore} />
            <Badge variant={client.heatLevel === "hot" ? "destructive" : client.heatLevel === "warm" ? "default" : "secondary"}>
              {client.heatLevel}
            </Badge>
          </div>
        </div>
      </div>
      <Separator className="mb-4" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="profile" className="flex items-center gap-2 shrink-0">
            <Users className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="interests" className="flex items-center gap-2 shrink-0">
            <Gift className="h-4 w-4" />
            Interests
          </TabsTrigger>
          <TabsTrigger value="outreach" className="flex items-center gap-2 shrink-0">
            <Calendar className="h-4 w-4" />
            Outreach
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-2 shrink-0">
            <Briefcase className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex items-center gap-2 shrink-0">
            <MapPin className="h-4 w-4" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-2 shrink-0">
            <Mail className="h-4 w-4" />
            Tags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <ProfileTab client={client} />
        </TabsContent>

        <TabsContent value="interests" className="space-y-4">
          <InterestsTab client={client} />
        </TabsContent>

        <TabsContent value="outreach" className="space-y-4">
          <OutreachHistoryTab client={client} />
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <ActivityTimelineTab client={client} />
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <NotesTab client={client} />
        </TabsContent>

        <TabsContent value="tags" className="space-y-4">
          <TagsTab client={client} />
        </TabsContent>
      </Tabs>
    </div>
  );
}