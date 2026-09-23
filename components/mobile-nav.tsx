"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Phone, BarChart3, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/follow-ups", label: "Follow", icon: Phone },
  { href: "/analytics", label: "Stats", icon: BarChart3 },
];

const itemClass = "relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium";

export function MobileNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      {items.map((it) => {
        const active = pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href + "/"));
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              itemClass,
              active
                ? "text-foreground before:absolute before:top-0 before:inset-x-4 before:h-0.5 before:rounded-full before:bg-meridian-gold-deep dark:before:bg-meridian-gold"
                : "text-muted-foreground",
            )}
          >
            <it.icon className="size-5" />
            <span>{it.label}</span>
          </Link>
        );
      })}
      {/* The sidebar sheet holds everything the four tabs don't (Prospects, Promos, Smart Lists, Settings…). */}
      <button type="button" onClick={() => setOpenMobile(true)} className={cn(itemClass, "text-muted-foreground")}>
        <Menu className="size-5" />
        <span>More</span>
      </button>
    </nav>
  );
}
