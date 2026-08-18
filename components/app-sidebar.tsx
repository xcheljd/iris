"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Phone, ListFilter, Tag, BarChart3, Ban, MailX, Settings, LogOut, Watch, KeyRound, ShieldCheck, UserSearch, Library, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { IrisIcon } from "@/components/iris-icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/utils";

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
    { href: "/analytics/collections", label: "Collections", icon: Watch },
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
}

export function AppSidebar({ initialPendingCount = 0, initialCatalogFlagCount = 0 }: AppSidebarProps = {}) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const { data: session } = useSession();
  const collapsed = state === "collapsed";
  const isManager = session?.user?.role === "manager";
  const userInitials = initials(session?.user?.firstName || session?.user?.name || "U", session?.user?.lastName);
  const activeHref = useMemo(() => activeHrefFor(pathname), [pathname]);
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [catalogFlagCount, setCatalogFlagCount] = useState(initialCatalogFlagCount);

  useEffect(() => { setPendingCount(initialPendingCount); }, [initialPendingCount]);
  useEffect(() => { setCatalogFlagCount(initialCatalogFlagCount); }, [initialCatalogFlagCount]);

  // SSR provides the initial counts, so skip the mount fetch; refetch only on
  // subsequent client-side navigations to keep the badges fresh.
  const skipNextFetch = useRef(true);
  useEffect(() => {
    if (!isManager) return;
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    fetch("/api/approvals/count").then(r => r.ok ? r.json() : { count: 0 }).then(d => setPendingCount(d.count)).catch(() => {});
    fetch("/api/catalog/flags/count").then(r => r.ok ? r.json() : { count: 0 }).then(d => setCatalogFlagCount(d.count)).catch(() => {});
  }, [isManager, pathname]);

  return (
    <Sidebar collapsible="icon" data-tour="sidebar">
      <SidebarHeader className="border-b border-sidebar-border" data-tour="sidebar-header">
        <Link href="/" className={cn("flex items-center gap-2 py-1.5", collapsed ? "justify-center px-0" : "px-2")} aria-label="Iris Dashboard">
          <IrisIcon size={32} className="shrink-0" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-serif tracking-wide">Iris</span>
              <span className="text-[10px] text-sidebar-foreground/60">Meridian CRM</span>
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
                    const isApprovals = item.href === "/approvals";
                    const isCatalog = item.href === "/catalog";
                    return (
                      <SidebarMenuItem key={item.href}>
                        {collapsed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <SidebarMenuButton asChild isActive={active} className={cn(active && "text-accent")}>
                                <Link href={item.href}>
                                  <item.icon className="size-4" />
                                </Link>
                              </SidebarMenuButton>
                            </TooltipTrigger>
                            <TooltipContent side="right">{item.label}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <SidebarMenuButton asChild isActive={active} className={cn(active && "text-accent")}>
                            <Link href={item.href}>
                              <item.icon className="size-4" />
                              <span>{item.label}</span>
                              {isApprovals && pendingCount > 0 && (
                                <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-[10px]">{pendingCount}</Badge>
                              )}
                              {isCatalog && catalogFlagCount > 0 && (
                                <Badge variant="secondary" className="ml-auto h-5 min-w-5 px-1.5 text-[10px]">{catalogFlagCount}</Badge>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        )}
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
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground" aria-label={`Account menu (${session?.user?.name ?? "User"})`}>
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-xs font-medium">{session?.user?.name}</span>
                    <span className="truncate text-[10px] text-sidebar-foreground/60 capitalize">{session?.user?.role}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 leading-tight">
                      <span className="truncate text-xs font-medium">{session?.user?.name}</span>
                      <span className="truncate text-[10px] text-muted-foreground capitalize">{session?.user?.role}</span>
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
