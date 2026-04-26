import { Suspense } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";
import { DashboardSkeleton } from "@/components/skeletons";
import { Topbar } from "@/components/topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="flex min-h-svh flex-col pb-16 md:pb-0">
          <Suspense fallback={<><Topbar /><DashboardSkeleton /></>}>
            {children}
          </Suspense>
        </main>
      </SidebarInset>
      <CommandPalette />
      <MobileNav />
    </SidebarProvider>
  );
}
