import { Suspense } from "react";
import { getEmployees, getTags, getTemplates, getDeletedClients } from "@/lib/queries";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SettingsContent } from "./settings-content";
import { SettingsSkeleton } from "@/components/skeletons";

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsFetcher />
    </Suspense>
  );
}

async function SettingsFetcher() {
  const session = await getServerSession(authOptions);
  const employees = await getEmployees();
  const tags = await getTags();
  const templates = await getTemplates();
  const deletedClients = await getDeletedClients();
  return <SettingsContent employees={employees} tags={tags} templates={templates} deletedClients={JSON.parse(JSON.stringify(deletedClients))} currentUserId={(session?.user as { id?: string })?.id ?? ""} currentUserRole={session?.user?.role ?? "associate"} />;
}
