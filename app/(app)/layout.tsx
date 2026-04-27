import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="flex min-h-svh flex-col pb-16 md:pb-0">
          {children}
        </main>
      </SidebarInset>
      <CommandPalette />
      <MobileNav />
    </SidebarProvider>
  );
}
