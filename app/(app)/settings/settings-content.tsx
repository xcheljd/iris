"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Tag, Trash2, UserCircle, GraduationCap, DatabaseBackup, Award, Store } from "lucide-react";
import { StoreTab } from "@/components/store-name-form";
import { Topbar } from "@/components/topbar";
import { ProfileTab } from "./profile-tab";
import { EmployeesTab } from "./employees-tab";
import { SettingsTagsTab } from "./tags-tab";
import { SettingsBrandsTab } from "./brands-tab";
import type { BrandRow } from "@/lib/actions/brands";
import { DeletedTab } from "./deleted-tab";
import { BackupTab } from "./backup-tab";
import { OnboardingSettingsTab } from "@/components/onboarding/onboarding-settings-tab";
import type { SafeEmployeeRow } from "@/lib/queries";
import type { ClientTag } from "@/lib/db/schema";
import type { Client } from "@/lib/db/schema";
import type { OnboardingState } from "@/lib/actions/onboarding";

interface SettingsContentProps {
  employees: SafeEmployeeRow[];
  tags: ClientTag[];
  brands: BrandRow[];
  deletedClients: Client[];
  currentUserRole: string;
  currentUserId: string;
  onboardingState: OnboardingState | null;
  storeName?: string | null;
}

export function SettingsContent({ employees, tags, brands, deletedClients, currentUserRole, currentUserId, onboardingState, storeName = null }: SettingsContentProps) {
  const isManager = currentUserRole === "manager";
  const currentUser = employees.find((e) => e.id === currentUserId);

  return (
    <>
      <Topbar title="Settings" />
      <div className="flex-1 p-4 md:p-6">
        <div className="mb-6">
          <h1 className="sr-only">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your store, employees, brands, tags, and backups
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile" className="gap-1">
              <UserCircle className="size-4" />
              Profile
            </TabsTrigger>
            {isManager && (
              <TabsTrigger value="store" className="gap-1">
                <Store className="size-4" />
                Store
              </TabsTrigger>
            )}
            {isManager && (
              <TabsTrigger value="employees" className="gap-1" data-tour="employee-management">
                <Users className="size-4" />
                Employees
              </TabsTrigger>
            )}
            {/* Managers only: backups download the whole database (the API is manager-only too). */}
            {isManager && (
              <TabsTrigger value="backup" className="gap-1" data-tour="backup">
                <DatabaseBackup className="size-4" />
                Backup
              </TabsTrigger>
            )}
            {isManager && (
              <TabsTrigger value="brands" className="gap-1">
                <Award className="size-4" />
                Brands
              </TabsTrigger>
            )}
            <TabsTrigger value="tags" className="gap-1">
              <Tag className="size-4" />
              Tags
            </TabsTrigger>
            <TabsTrigger value="deleted" className="gap-1">
              <Trash2 className="size-4" />
              Deleted
            </TabsTrigger>
            <TabsTrigger value="onboarding" className="gap-1">
              <GraduationCap className="size-4" />
              Onboarding
            </TabsTrigger>
          </TabsList>

          {isManager && (
            <TabsContent value="store">
              <StoreTab storeName={storeName} />
            </TabsContent>
          )}

          {isManager && (
            <TabsContent value="brands">
              <SettingsBrandsTab brands={brands} />
            </TabsContent>
          )}

          <TabsContent value="profile">
            <ProfileTab currentUser={currentUser} currentUserId={currentUserId} />
          </TabsContent>

          {isManager && (
          <TabsContent value="employees">
            <EmployeesTab employees={employees} currentUserId={currentUserId} />
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
