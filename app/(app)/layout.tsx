import { cookies } from "next/headers";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette, CommandPaletteProvider } from "@/components/command-palette";
import { GNav } from "@/components/g-nav";
import { MobileNav } from "@/components/mobile-nav";
import { OnboardingProvider, TourOverlay, TourTooltip, TourErrorBoundary, ResumeTourButton, HintManager } from "@/components/onboarding";
import { PageTransitionOverlay } from "@/components/page-transition-overlay";
import { RouteFade } from "@/components/route-fade";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // shadcn's documented persistence: SidebarProvider writes the sidebar_state
  // cookie on every toggle; reading it here renders the saved state on the
  // server, so it survives reloads with no flash. Iris defaults to expanded
  // when there is no cookie yet (the docs' `=== "true"` would start new users
  // collapsed).
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <CommandPaletteProvider>
        <OnboardingProvider>
          <AppSidebar />
          {/* Bottom padding clears the fixed MobileNav (and the home-indicator inset) below md. */}
          <SidebarInset className="relative pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
            <RouteFade>{children}</RouteFade>
            <PageTransitionOverlay />
          </SidebarInset>
          <CommandPalette />
          <GNav />
          <MobileNav />
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
