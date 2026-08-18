import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette, CommandPaletteProvider } from "@/components/command-palette";
import { GNav } from "@/components/g-nav";
import { MobileNav } from "@/components/mobile-nav";
import { BackupReminderDialog } from "@/components/backup-reminder-dialog";
import { OnboardingProvider, TourOverlay, TourTooltip, TourErrorBoundary, ResumeTourButton, HintManager } from "@/components/onboarding";
import { PageTransitionOverlay } from "@/components/page-transition-overlay";
import { RouteFade } from "@/components/route-fade";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <CommandPaletteProvider>
        <OnboardingProvider>
          <AppSidebar />
          <SidebarInset className="relative">
            <RouteFade>{children}</RouteFade>
            <PageTransitionOverlay />
          </SidebarInset>
          <CommandPalette />
          <GNav />
          <MobileNav />
          <BackupReminderDialog />
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
