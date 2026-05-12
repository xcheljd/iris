import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette, CommandPaletteProvider } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";
import { BackupReminderDialog } from "@/components/backup-reminder-dialog";
import { OnboardingProvider, TourOverlay, TourTooltip, TourErrorBoundary } from "@/components/onboarding";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";

  return (
    <SidebarProvider>
      <CommandPaletteProvider>
        <OnboardingProvider>
          <AppSidebar />
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
          </TourErrorBoundary>
        </OnboardingProvider>
      </CommandPaletteProvider>
    </SidebarProvider>
  );
}
