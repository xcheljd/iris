"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Phone, Mail, Calendar, User, Gift } from "lucide-react";
import { format } from "date-fns";
import { formatOccasionDate, fullName } from "@/lib/utils";
import type { FullClient } from "@/components/client-provider";
import { EmailLink, PhoneLink } from "@/components/contact-picker";

interface ProfileTabProps {
  client: FullClient;
}

export function ProfileTab({ client }: ProfileTabProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-5" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Phone className="size-4 text-muted-foreground" />
              <span>Phone</span>
            </div>
            {client.phone ? (
              <PhoneLink phone={client.phone} name={fullName(client)} className="font-mono ml-auto" />
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
              <EmailLink email={client.email} name={fullName(client)} className="font-mono text-right" />
            ) : (
              <span className="text-muted-foreground">Not provided</span>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
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
        <CardContent className="flex flex-col gap-4">
          {client.birthday && (
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-muted-foreground" />
              <span>Birthday: </span>
              <span className="font-medium">
                {formatOccasionDate(client.birthday, "MMMM d")}
              </span>
            </div>
          )}

          {client.anniversary && (
            <div className="flex items-center gap-2">
              <Gift className="size-4 text-muted-foreground" />
              <span>Anniversary: </span>
              <span className="font-medium">
                {formatOccasionDate(client.anniversary, "MMMM d")}
              </span>
            </div>
          )}

          <Separator />

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Source</h4>
            <Badge variant="secondary">{client.source}</Badge>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Preferred Contact</h4>
            <Badge variant="secondary">
              {client.preferredContact
                ? client.preferredContact.charAt(0).toUpperCase() + client.preferredContact.slice(1)
                : "—"}
            </Badge>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Status</h4>
            <Badge
              variant={
                client.status === "active" ? "default" : "destructive"
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
        <CardContent className="flex flex-col gap-4">
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
