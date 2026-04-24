"use client";

import { useClient, useActiveTab } from "@/components/client-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, Phone, Mail, Tag, Copy, Star } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { FollowUpForm } from "@/components/follow-up-form";

export function ClientSidebar() {
  const client = useClient();
  const { setActiveTab } = useActiveTab();
  if (!client) return null;

  const [isOpen, setIsOpen] = useState(false);

  const handleCopy = async (text: string, type: "phone" | "email") => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${type} to clipboard`);
    } catch (err) {
      toast(`Failed to copy ${type}`);
    }
  };

  const nextFollowUp = client.followUps.find(
    (fu) => fu.followUpDate && new Date(fu.followUpDate) > new Date()
  );

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
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Phone</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(client.phone!, "phone")}
              >
                <Phone className="h-4 w-4 mr-1" />
                Copy
              </Button>
            </div>
          )}
          {client.email && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(client.email!, "email")}
              >
                <Mail className="h-4 w-4 mr-1" />
                Copy
              </Button>
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
                <div className="p-2 bg-accent rounded">
                  <div className="text-sm font-medium">Next</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(nextFollowUp.followUpDate!), "MMM d, yyyy")}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No scheduled follow-ups</div>
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
              {client.tags.map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No tags</div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button className="w-full" variant="outline">
                <Calendar className="h-4 w-4 mr-2" />
                Log Outreach
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[400px]">
              <FollowUpForm
                clientId={client.id}
                onSuccess={() => setIsOpen(false)}
              />
            </SheetContent>
          </Sheet>
          
          {client.matches.length > 0 && (
            <Button className="w-full" variant="outline" onClick={() => setActiveTab("interests")}>
              <Star className="h-4 w-4 mr-2" />
              Promo Matches ({client.matches.length})
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Separator />
      <div className="space-y-2 text-sm">
        <div><span className="text-muted-foreground">Employee:</span> {client.employeeId ? "Assigned" : "Unassigned"}</div>
        <div><span className="text-muted-foreground">Email List:</span> {client.onEmailList ? "Yes" : "No"}</div>
        <div><span className="text-muted-foreground">Status:</span> {client.status}</div>
        <div><span className="text-muted-foreground">Source:</span> {client.source}</div>
      </div>
    </div>
  );
}