"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Tag, FileText, Trash2, UserCircle, DatabaseBackup, GraduationCap } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { ProfileTab } from "./profile-tab";
import { EmployeesTab } from "./employees-tab";
import { SettingsTagsTab } from "./tags-tab";
import { TemplatesTab } from "./templates-tab";
import { DeletedTab } from "./deleted-tab";
import { BackupTab } from "./backup-tab";
import { OnboardingSettingsTab } from "@/components/onboarding/onboarding-settings-tab";
import type { SafeEmployeeRow } from "@/lib/queries";
import type { ClientTag } from "@/lib/db/schema";
import type { OutreachTemplate } from "@/lib/db/schema";
import type { Client } from "@/lib/db/schema";
import type { OnboardingState } from "@/lib/actions/onboarding";

interface SettingsContentProps {
  employees: SafeEmployeeRow[];
  tags: ClientTag[];
  templates: OutreachTemplate[];
  deletedClients: Client[];
  currentUserRole: string;
  currentUserId: string;
  onboardingState: OnboardingState | null;
}

export function SettingsContent({ employees, tags, templates, deletedClients, currentUserRole, currentUserId, onboardingState }: SettingsContentProps) {
  const isManager = currentUserRole === "manager";
  const currentUser = employees.find((e) => e.id === currentUserId);

  return (
    <>
      <Topbar title="Settings" />
      <div className="flex-1 p-4 md:p-6">
        <div className="mb-6">
          <h1 className="sr-only">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage employees, tags, and outreach templates
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile" className="gap-1">
              <UserCircle className="h-4 w-4" />
              Profile
            </TabsTrigger>
            {isManager && (
              <TabsTrigger value="employees" className="gap-1" data-tour="employee-management">
                <Users className="h-4 w-4" />
                Employees
              </TabsTrigger>
            )}
            {isManager && (
              <TabsTrigger value="backup" className="gap-1" data-tour="backup">
                <DatabaseBackup className="h-4 w-4" />
                Backup
              </TabsTrigger>
            )}
            <TabsTrigger value="tags" className="gap-1">
              <Tag className="h-4 w-4" />
              Tags
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="deleted" className="gap-1">
              <Trash2 className="h-4 w-4" />
              Deleted
            </TabsTrigger>
            <TabsTrigger value="onboarding" className="gap-1">
              <GraduationCap className="h-4 w-4" />
              Onboarding
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileTab currentUser={currentUser} currentUserId={currentUserId} />
          </TabsContent>

          {isManager && (
          <TabsContent value="employees">
            <EmployeesTab employees={employees} />
          </TabsContent>
          )}

          {isManager && (
          <TabsContent value="backup">
            <BackupTab />
          </TabsContent>
          )}

          <TabsContent value="tags">
            <SettingsTagsTab tags={tags} isManager={isManager} />
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesTab templates={templates} isManager={isManager} />
          </TabsContent>

          <TabsContent value="deleted">
            <DeletedTab deletedClients={deletedClients} isManager={isManager} />
          </TabsContent>

          <TabsContent value="onboarding">
            <OnboardingSettingsTab initialState={onboardingState} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
