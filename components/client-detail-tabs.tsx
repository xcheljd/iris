"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, Mail, Gift, Users, MoreHorizontal, Edit, Ban, MailX, Trash2, ShieldOff, UserCheck, StickyNote, Tag, Activity, ArrowRightLeft, Merge } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useClient } from "@/components/client-provider";
import { ProfileTab } from "@/components/profile-tab";
import { InterestsTab } from "@/components/interests-tab";
import { OutreachHistoryTab } from "@/components/outreach-history-tab";
import { ActivityTimelineTab } from "@/components/activity-timeline-tab";
import { NotesTab } from "@/components/notes-tab";
import { TagsTab } from "@/components/tags-tab";
import { HeatScoreBar } from "@/components/heat-score-bar";
import { EditClientDialog } from "@/components/edit-client-dialog";
import { OutreachLogger } from "@/components/outreach-logger";
import { BanCustomerDialog, UnsubscribeCustomerDialog, DeleteCustomerDialog } from "@/components/client-status-actions";
import { TransferClientDialog } from "@/components/transfer-client-dialog";
import { MergeClientDialog } from "@/components/merge-client-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toggleEmailList, resubscribeClient, unbanClient } from "@/lib/actions";
import { toast } from "sonner";

export function ClientDetailTabs({ currentUserRole }: { currentUserRole?: string }) {
  const client = useClient();
  const [activeTab, setActiveTab] = useState("profile");
  if (!client) return null;

  return (
    <div className="p-4 md:p-6" data-tour="client-detail-tabs">
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
        <div className="sm:ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Actions" data-hint="edit-client">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <EditClientDialog client={client}>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Edit className="h-4 w-4 mr-2" /> Edit Client
                </DropdownMenuItem>
              </EditClientDialog>
              <OutreachLogger
                clientId={client.id}
                clientName={`${client.firstName} ${client.lastName}`}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Calendar className="h-4 w-4 mr-2" /> Log Outreach
                  </DropdownMenuItem>
                }
              />
              {currentUserRole === "manager" && (
                <TransferClientDialog
                  clientId={client.id}
                  clientName={`${client.firstName} ${client.lastName ?? ""}`}
                  currentEmployeeId={client.employeeId}
                >
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <ArrowRightLeft className="h-4 w-4 mr-2" /> Transfer Client
                  </DropdownMenuItem>
                </TransferClientDialog>
              )}
              {currentUserRole === "manager" && (
                <MergeClientDialog>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Merge className="h-4 w-4 mr-2" /> Merge with…
                  </DropdownMenuItem>
                </MergeClientDialog>
              )}
              {client.status !== "unsubscribed" && client.status !== "deleted" && client.onEmailList && (
                <ConfirmDialog
                  title="Remove from Email List"
                  description={<>Are you sure you want to remove <strong>{client.firstName} {client.lastName}</strong> from the email list? They will no longer receive marketing emails.</>}
                  confirmLabel="Remove"
                  variant="destructive"
                  onConfirm={async () => { const r = await toggleEmailList(client.id); if (r?.error) { toast.error(r.error); } else { toast.success("Removed from email list"); } }}
                >
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}>
                    <Mail className="h-4 w-4 mr-2" /> Remove from Email List
                  </DropdownMenuItem>
                </ConfirmDialog>
              )}
              {client.status !== "unsubscribed" && client.status !== "deleted" && !client.onEmailList && (
                <DropdownMenuItem onClick={async () => { const r = await toggleEmailList(client.id); if (r?.error) { toast.error(r.error); } else { toast.success("Added to email list"); } }}>
                  <Mail className="h-4 w-4 mr-2" /> Add to Email List
                </DropdownMenuItem>
              )}
              {client.status === "active" && (
                <>
                  <DropdownMenuSeparator />
                  <BanCustomerDialog clientId={client.id} clientName={`${client.firstName} ${client.lastName ?? ""}`}>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}>
                      <Ban className="h-4 w-4 mr-2" /> Ban Customer
                    </DropdownMenuItem>
                  </BanCustomerDialog>
                  <UnsubscribeCustomerDialog clientId={client.id} clientName={`${client.firstName} ${client.lastName ?? ""}`}>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}>
                      <MailX className="h-4 w-4 mr-2" /> Unsubscribe
                    </DropdownMenuItem>
                  </UnsubscribeCustomerDialog>
                </>
              )}
              {client.status === "banned" && currentUserRole === "manager" && (
                <>
                  <DropdownMenuSeparator />
                  <ConfirmDialog
                    title="Unban Customer"
                    description={<>Are you sure you want to unban <strong>{client.firstName} {client.lastName}</strong>? This will restore their status to active.</>}
                    confirmLabel="Unban"
                    onConfirm={() => unbanClient(client.id).then(() => { toast.success("Customer unbanned"); }).catch(() => { toast.error("Failed to unban"); })}
                  >
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <ShieldOff className="h-4 w-4 mr-2" /> Unban Customer
                    </DropdownMenuItem>
                  </ConfirmDialog>
                </>
              )}
              {client.status === "unsubscribed" && currentUserRole === "manager" && (
                <>
                  <DropdownMenuSeparator />
                  <ConfirmDialog
                    title="Resubscribe Customer"
                    description={<>Are you sure you want to resubscribe <strong>{client.firstName} {client.lastName}</strong>? This will allow all forms of contact again.</>}
                    confirmLabel="Resubscribe"
                    onConfirm={() => resubscribeClient(client.id).then(() => { toast.success("Customer resubscribed"); }).catch(() => { toast.error("Failed to resubscribe"); })}
                  >
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <UserCheck className="h-4 w-4 mr-2" /> Resubscribe
                    </DropdownMenuItem>
                  </ConfirmDialog>
                </>
              )}
              {client.status !== "deleted" && (
                <>
                  <DropdownMenuSeparator />
                  <DeleteCustomerDialog clientId={client.id} clientName={`${client.firstName} ${client.lastName ?? ""}`}>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete Client
                    </DropdownMenuItem>
                  </DeleteCustomerDialog>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
            <Activity className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex items-center gap-2 shrink-0">
            <StickyNote className="h-4 w-4" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-2 shrink-0">
            <Tag className="h-4 w-4" />
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