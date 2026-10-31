"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Phone, ListFilter, Tag, BarChart3, Ban, MailX, Settings, LogOut, Layers, KeyRound, ShieldCheck, UserSearch, Library, ChevronsUpDown, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { IrisIcon } from "@/components/iris-icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "next-auth/react";
import { initials } from "@/lib/utils";
import { useFollowUpCount } from "@/hooks/use-follow-up-count";
import { CountBadge, countAriaLabel, type CountKind } from "@/components/count-badge";
import { useThemeToggle } from "@/hooks/use-theme-toggle";

const baseNav = [
  { section: "Overview", items: [
    { href: "/", label: "Dashboard", icon: Home },
  ]},
  { section: "Clients", items: [
    { href: "/clients", label: "Client List", icon: Users },
    { href: "/prospects", label: "Prospects", icon: UserSearch },
    { href: "/follow-ups", label: "Follow-Ups", icon: Phone },
    { href: "/smart-lists", label: "Smart Lists", icon: ListFilter },
  ]},
  { section: "Inventory", items: [
    { href: "/promos", label: "Promo Manager", icon: Tag },
    { href: "/catalog", label: "Model Catalog", icon: Library, managerOnly: true },
  ]},
  { section: "Analytics", items: [
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/analytics/collections", label: "Collections", icon: Layers },
  ]},
  { section: "Compliance", items: [
    { href: "/banned", label: "Banned", icon: Ban },
    { href: "/unsubscribed", label: "Unsubscribed", icon: MailX },
  ]},
  { section: "System", items: [
    { href: "/approvals", label: "Approvals", icon: ShieldCheck, managerOnly: true },
    { href: "/settings", label: "Settings", icon: Settings },
  ]},
];

const ALL_NAV_HREFS = baseNav.flatMap((group) => group.items.map((item) => item.href));

// Same treatment as the mobile tab bar's active tab, turned on its side: the
// foreground colour plus a gold bar on the leading edge. The colour carries the
// data-[active=true] variant so it replaces SidebarMenuButton's own active
// colour (a bare text-* loses to it on specificity).
const ACTIVE_ITEM =
  "relative data-[active=true]:text-foreground before:absolute before:left-0 before:inset-y-2 before:w-0.5 before:rounded-full before:bg-iris-gold-deep dark:before:bg-iris-gold";

// Prefix match so detail routes (e.g. /clients/<id>) highlight their parent
// nav item; when multiple hrefs match (e.g. /analytics vs
// /analytics/collections) the longest (deepest) href wins.
function activeHrefFor(pathname: string): string | null {
  let best: string | null = null;
  for (const href of ALL_NAV_HREFS) {
    const matches = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
    if (matches && (!best || href.length > best.length)) best = href;
  }
  return best;
}

interface AppSidebarProps {
  initialPendingCount?: number;
  initialCatalogFlagCount?: number;
  /** Settings → Store; "Your store" until a manager names it. */
  storeName?: string | null;
}

export function AppSidebar({ initialPendingCount = 0, initialCatalogFlagCount = 0, storeName = null }: AppSidebarProps = {}) {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  // On mobile the nav lives in a Sheet; close it once a destination is picked.
  const closeMobile = () => setOpenMobile(false);
  const { data: session } = useSession();
  // The phone Sheet always shows the full menu, whatever the desktop state is.
  const collapsed = state === "collapsed" && !isMobile;
  const isManager = session?.user?.role === "manager";
  const userInitials = initials(session?.user?.firstName || session?.user?.name || "U", session?.user?.lastName);
  const activeHref = useMemo(() => activeHrefFor(pathname), [pathname]);
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [catalogFlagCount, setCatalogFlagCount] = useState(initialCatalogFlagCount);
  const followUpCount = useFollowUpCount();
  const toggleTheme = useThemeToggle();

  // Fetch the badge counts on mount and refresh them on every client-side
  // navigation.
  useEffect(() => {
    if (!isManager) return;
    fetch("/api/approvals/count").then(r => r.ok ? r.json() : { count: 0 }).then(d => setPendingCount(d.count)).catch(() => {});
    fetch("/api/catalog/flags/count").then(r => r.ok ? r.json() : { count: 0 }).then(d => setCatalogFlagCount(d.count)).catch(() => {});
  }, [isManager, pathname]);

  return (
    <Sidebar collapsible="icon" data-tour="sidebar">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border" data-tour="sidebar-header">
        <Link href="/" className={cn("flex items-center gap-2", collapsed ? "justify-center px-0" : "px-2")} aria-label="Iris Dashboard">
          <IrisIcon size={32} className="shrink-0" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-serif tracking-wide">Iris</span>
              <span className="text-xs tracking-wide text-sidebar-foreground/60 truncate max-w-40">{storeName ?? "Your store"}</span>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent data-tour="sidebar-nav">
        {baseNav.map((group, i) => {
          const visibleItems = group.items.filter((item) => !("managerOnly" in item && item.managerOnly && !isManager));
          if (visibleItems.length === 0) return null;
          return (
          <div key={group.section}>
            <SidebarGroup>
              {!collapsed && <SidebarGroupLabel>{group.section}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    const active = item.href === activeHref;
                    const count = item.href === "/approvals" ? pendingCount
                      : item.href === "/catalog" ? catalogFlagCount
                      : item.href === "/follow-ups" ? followUpCount
                      : 0;
                    const countKind: CountKind | null = item.href === "/approvals" ? "pending"
                      : item.href === "/catalog" ? "review"
                      : item.href === "/follow-ups" ? "due"
                      : null;
                    return (
                      <SidebarMenuItem key={item.href}>
                        {/* tooltip shows only while collapsed, never on phones (built into SidebarMenuButton) */}
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label} className={cn(active && ACTIVE_ITEM)}>
                            <Link href={item.href} onClick={closeMobile} aria-label={countAriaLabel(item.label, count, countKind)}>
                              <item.icon className="size-4" />
                              <span>{item.label}</span>
                              <CountBadge count={count} variant="inline" />
                            </Link>
                        </SidebarMenuButton>
                        {/* Local change: shadcn hides menu badges in icon mode; Iris keeps
                            counts visible as a corner badge on the icon. A sibling of the
                            button because the collapsed button clips its overflow. A single
                            digit drops px-1, which (plus the border) would make it 17px wide.
                            text-box trims the line to cap height so flex centers the digits'
                            ink, not Inter's ascent/descent box (which rode ~1px high at 1.05/1.25 DPR). */}
                        <CountBadge count={count} variant="corner" />
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {i < baseNav.length - 1 && <Separator className="mx-2 bg-white/10" />}
          </div>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {/* Phones have no top bar, so the theme switch lives here (opened by More). */}
          {isMobile && (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleTheme}>
                <Moon className="size-4 dark:hidden" />
                <Sun className="size-4 hidden dark:block" />
                <span className="dark:hidden">Dark mode</span>
                <span className="hidden dark:inline">Light mode</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground" aria-label={`Account menu (${session?.user?.name ?? "User"})`}>
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-xs font-medium">{session?.user?.name}</span>
                    <span className="truncate text-xs tracking-wide text-sidebar-foreground/60 capitalize">{session?.user?.role}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 leading-tight">
                      <span className="truncate text-xs font-medium">{session?.user?.name}</span>
                      <span className="truncate text-xs tracking-wide text-muted-foreground capitalize">{session?.user?.role}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/change-password">
                    <KeyRound />
                    Change Password
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                  <LogOut />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
