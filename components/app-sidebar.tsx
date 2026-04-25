"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Phone, ListFilter, Tag, BarChart3, Ban, MailX, Settings, LogOut, Watch, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";

const nav = [
  { section: "Overview", items: [
    { href: "/", label: "Dashboard", icon: Home },
  ]},
  { section: "Clients", items: [
    { href: "/clients", label: "Client List", icon: Users },
    { href: "/follow-ups", label: "Follow-Ups", icon: Phone },
    { href: "/smart-lists", label: "Smart Lists", icon: ListFilter },
  ]},
  { section: "Inventory", items: [
    { href: "/promos", label: "Promo Manager", icon: Tag },
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
    { href: "/settings", label: "Settings", icon: Settings },
  ]},
];

export function AppSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const { data: session } = useSession();
  const collapsed = state === "collapsed";

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2 px-2 py-1.5">
          <div className="h-8 w-8 shrink-0 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center">
            <span className="text-accent text-sm font-serif">C</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-serif tracking-wide">Iris</span>
              <span className="text-[10px] text-sidebar-foreground/60">Meridian CRM</span>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {nav.map((group, i) => (
          <div key={group.section}>
            <SidebarGroup>
              {!collapsed && <SidebarGroupLabel>{group.section}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={active} className={cn(active && "text-accent")}>
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            {!collapsed && <span>{item.label}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {i < nav.length - 1 && <Separator className="mx-2" />}
          </div>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-accent/20 text-accent text-xs">{initials(session?.user?.name || "U")}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{session?.user?.name}</p>
              <p className="text-[10px] text-sidebar-foreground/60 capitalize">{session?.user?.role}</p>
            </div>
          )}
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/change-password">
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Change Password</TooltipContent>
            </Tooltip>
          )}
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => signOut({ callbackUrl: "/login" })}>
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign Out</TooltipContent>
            </Tooltip>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
