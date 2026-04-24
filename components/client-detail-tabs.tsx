"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, Phone, Mail, MapPin, Gift, Briefcase, Users } from "lucide-react";
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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {client.firstName} {client.lastName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Added {format(new Date(client.dateAdded), "MMMM d, yyyy")}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <HeatScoreBar score={client.heatScore} />
          <Badge variant={client.heatLevel === "hot" ? "destructive" : client.heatLevel === "warm" ? "default" : "secondary"}>
            {client.heatLevel}
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="interests" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Interests
          </TabsTrigger>
          <TabsTrigger value="outreach" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Outreach
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-2">
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