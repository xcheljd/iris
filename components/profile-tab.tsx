"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Phone, Mail, Calendar, User, Gift, Copy } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { FullClient } from "@/components/client-provider";

interface ProfileTabProps {
  client: FullClient;
}

export function ProfileTab({ client }: ProfileTabProps) {
  const handlePhoneCopy = async () => {
    if (client.phone) {
      try {
        await navigator.clipboard.writeText(client.phone);
        toast.success("Phone copied to clipboard");
      } catch (error) {
        toast.error("Failed to copy phone", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  };

  const handleEmailCopy = async () => {
    if (client.email) {
      try {
        await navigator.clipboard.writeText(client.email);
        toast.success("Email copied to clipboard");
      } catch (error) {
        toast.error("Failed to copy email", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-5" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Phone className="size-4 text-muted-foreground" />
              <span>Phone</span>
            </div>
            {client.phone ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono truncate">{client.phone}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePhoneCopy}
                      className="size-8 shrink-0"
                      aria-label="Copy phone number"
                    >
                      <Copy className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy phone number</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <span className="text-muted-foreground">Not provided</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Mail className="size-4 text-muted-foreground" />
              <span>Email</span>
            </div>
            {client.email ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono truncate">{client.email}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleEmailCopy}
                      className="size-8 shrink-0"
                      aria-label="Copy email address"
                    >
                      <Copy className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy email address</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <span className="text-muted-foreground">Not provided</span>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Employee Assignment</h4>
            <Badge variant="outline">
              {client.employeeName || "Unassigned"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {client.birthday && (
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-muted-foreground" />
              <span>Birthday: </span>
              <span className="font-medium">
                {format(new Date(client.birthday), "MMMM d")}
              </span>
            </div>
          )}

          {client.anniversary && (
            <div className="flex items-center gap-2">
              <Gift className="size-4 text-muted-foreground" />
              <span>Anniversary: </span>
              <span className="font-medium">
                {format(new Date(client.anniversary), "MMMM d")}
              </span>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Source</h4>
            <Badge variant="secondary">{client.source}</Badge>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Preferred Contact</h4>
            <Badge variant="secondary">
              {client.preferredContact
                ? client.preferredContact.charAt(0).toUpperCase() + client.preferredContact.slice(1)
                : "—"}
            </Badge>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Status</h4>
            <Badge
              variant={
                client.status === "active"
                  ? "default"
                  : client.status === "inactive"
                  ? "secondary"
                  : "destructive"
              }
            >
              {client.status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Additional Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Date Added
              </h4>
              <p className="text-sm">
                {format(new Date(client.dateAdded), "MMMM d, yyyy")}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Last Outreach
              </h4>
              <p className="text-sm">
                {client.lastOutreachAt
                  ? format(new Date(client.lastOutreachAt), "MMMM d, yyyy")
                  : "Never"}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Last Purchase
              </h4>
              <p className="text-sm">
                {client.lastPurchaseAt
                  ? format(new Date(client.lastPurchaseAt), "MMMM d, yyyy")
                  : "Never"}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Email List
              </h4>
              {client.status === "unsubscribed" ? (
                <Badge variant="destructive">Do Not Contact</Badge>
              ) : (
                <Badge variant={client.onEmailList ? "default" : "secondary"}>
                  {client.onEmailList ? "Subscribed" : "Not on list"}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
