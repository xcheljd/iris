import { Suspense } from "react";
import { getEmployees, getEmployee, getTags, getDeletedClients } from "@/lib/queries";
import { getOnboardingState } from "@/lib/actions/onboarding";
import { listBrands } from "@/lib/actions/brands";
import { requirePageSession } from "@/lib/auth";
import { SettingsContent } from "./settings-content";
import { SettingsSkeleton } from "@/components/skeletons";
import { getStoreName } from "@/lib/store-name";

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsFetcher />
    </Suspense>
  );
}

async function SettingsFetcher() {
  const session = await requirePageSession();
  const userId = session.user.id;
  const userRole = session.user.role;
  const isManager = userRole === "manager";

  // Managers see the full employee list (for the Employees tab).
  // Associates only need their own record (Profile tab) — Employees tab is hidden for them.
  const employees = isManager
    ? await getEmployees()
    : [await getEmployee(userId)].filter((e): e is NonNullable<typeof e> => e !== undefined);

  const tags = await getTags();
  const brands = isManager ? await listBrands() : [];
  const deletedClients = await getDeletedClients(isManager ? undefined : userId);
  const onboardingState = await getOnboardingState();
  return <SettingsContent employees={employees} tags={tags} brands={brands} deletedClients={JSON.parse(JSON.stringify(deletedClients))} currentUserId={userId} currentUserRole={userRole} onboardingState={onboardingState} storeName={isManager ? getStoreName() : null} />;
}
