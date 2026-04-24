"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Phone, Mail, Calendar, MapPin, User, Gift } from "lucide-react";
import { format } from "date-fns";
import { useClient } from "@/components/client-provider";
import { Button } from "@/components/ui/button";
import { EditClientDialog } from "@/components/edit-client-dialog";

interface ProfileTabProps {
  client: any;
}

export function ProfileTab({ client }: ProfileTabProps) {
  const handlePhoneCopy = async () => {
    if (client.phone) {
      try {
        await navigator.clipboard.writeText(client.phone);
        // This would normally use a toast, but we'll keep it simple
        alert("Phone copied to clipboard");
      } catch (err) {
        alert("Failed to copy phone");
      }
    }
  };

  const handleEmailCopy = async () => {
    if (client.email) {
      try {
        await navigator.clipboard.writeText(client.email);
        // This would normally use a toast, but we'll keep it simple
        alert("Email copied to clipboard");
      } catch (err) {
        alert("Failed to copy email");
      }
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>Phone</span>
            </div>
            {client.phone ? (
              <div className="flex items-center gap-2">
                <span className="font-mono">{client.phone}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePhoneCopy}
                  className="h-8 w-8"
                >
                  <Phone className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <span className="text-muted-foreground">Not provided</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>Email</span>
            </div>
            {client.email ? (
              <div className="flex items-center gap-2">
                <span className="font-mono">{client.email}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEmailCopy}
                  className="h-8 w-8"
                >
                  <Mail className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <span className="text-muted-foreground">Not provided</span>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Employee Assignment</h4>
            <Badge variant="outline">
              {client.employeeId ? "Assigned to associate" : "Unassigned"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {client.birthday && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Birthday: </span>
              <span className="font-medium">
                {format(new Date(client.birthday), "MMMM d")}
              </span>
            </div>
          )}

          {client.anniversary && (
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-muted-foreground" />
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

      {/* Additional Details */}
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
              <Badge variant={client.onEmailList ? "default" : "secondary"}>
                {client.onEmailList ? "Subscribed" : "Unsubscribed"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Button */}
      <div className="md:col-span-2">
        <EditClientDialog client={client} />
      </div>
    </div>
  );
}