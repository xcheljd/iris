import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette, CommandPaletteProvider } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";
import { BackupReminderDialog } from "@/components/backup-reminder-dialog";
import { OnboardingProvider, TourOverlay, TourTooltip, TourErrorBoundary, ResumeTourButton, HintManager } from "@/components/onboarding";
import { getSession } from "@/lib/auth";
import { getPendingApprovalCount, getCatalogFlagCount } from "@/lib/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const isManager = session?.user?.role === "manager";
  const [initialPendingApprovalCount, initialCatalogFlagCount] = isManager
    ? await Promise.all([getPendingApprovalCount(), getCatalogFlagCount()])
    : [0, 0];

  return (
    <SidebarProvider>
      <CommandPaletteProvider>
        <OnboardingProvider>
          <AppSidebar initialPendingCount={initialPendingApprovalCount} initialCatalogFlagCount={initialCatalogFlagCount} />
          <SidebarInset>
            <main className="flex min-h-svh flex-col overflow-x-hidden pb-16 md:pb-0">
              {children}
            </main>
          </SidebarInset>
          <CommandPalette />
          <MobileNav />
          {isManager && <BackupReminderDialog />}
          <TourErrorBoundary>
            <TourOverlay />
            <TourTooltip />
            <ResumeTourButton />
            <HintManager />
          </TourErrorBoundary>
        </OnboardingProvider>
      </CommandPaletteProvider>
    </SidebarProvider>
  );
}
