"use client";

import { useClient } from "@/components/client-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, Tag, Copy, Star, Plus, Ban, MailX, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useState } from "react";
import { OutreachLogger } from "@/components/outreach-logger";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { BanCustomerDialog, UnsubscribeCustomerDialog } from "@/components/client-status-actions";

export function ClientSidebar() {
  const client = useClient();
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);

  if (!client) return null;

  const handleCopy = async (text: string, type: "phone" | "email") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${type} to clipboard`);
    } catch (_err) {
      toast.error(`Failed to copy ${type}`);
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
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{client.phone}</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(client.phone!, "phone")}
                      aria-label="Copy phone number"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy phone number</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
          {client.email && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm truncate">{client.email}</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(client.email!, "email")}
                      aria-label="Copy email address"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy email address</TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
          <OutreachLogger
            clientId={client.id}
            clientName={`${client.firstName} ${client.lastName}`}
            trigger={
              <Button className="w-full" variant="outline">
                <Calendar className="h-4 w-4 mr-2" />
                Log Outreach
              </Button>
            }
          />
          
          {client.matches.length > 0 && (
            <Dialog open={promoDialogOpen} onOpenChange={setPromoDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" variant="outline">
                  <Star className="h-4 w-4 mr-2" />
                  Promo Matches ({client.matches.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5" />
                    Promo Matches ({client.matches.length})
                  </DialogTitle>
                  <DialogDescription>Current promo watches matching this client&apos;s interests</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 mt-2">
                  {client.matches.filter((m) => m.promo?.modelNumber || m.promo?.collection).map((m, index: number) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-medium">{m.promo?.modelNumber}</div>
                          <div className="text-sm text-muted-foreground">{m.promo?.collection}</div>
                        </div>
                        <Badge variant={m.match.matchType === "model" ? "default" : "secondary"}>
                          {m.match.matchType}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}

          {client.status === "active" && (
            <>
              <Separator className="my-1" />
              <BanCustomerDialog clientId={client.id} clientName={`${client.firstName} ${client.lastName ?? ""}`}>
                <Button className="w-full" variant="outline">
                  <Ban className="h-4 w-4 mr-2" />
                  Ban Customer
                </Button>
              </BanCustomerDialog>
              <UnsubscribeCustomerDialog clientId={client.id} clientName={`${client.firstName} ${client.lastName ?? ""}`}>
                <Button className="w-full" variant="outline">
                  <MailX className="h-4 w-4 mr-2" />
                  Unsubscribe
                </Button>
              </UnsubscribeCustomerDialog>
            </>
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