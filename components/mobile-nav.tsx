"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Phone, BarChart3, Menu, Search } from "lucide-react";
import { useCommandPalette } from "@/components/command-palette";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { useFollowUpCount } from "@/hooks/use-follow-up-count";
import { CountBadge, countAriaLabel } from "@/components/count-badge";

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
  const followUpCount = useFollowUpCount();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      {items.map((it) => {
        const active = pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href + "/"));
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            // "Follow-Ups, 4 due": the full page name plus the count's meaning.
            aria-label={it.href === "/follow-ups" ? countAriaLabel("Follow-Ups", followUpCount, "due") : undefined}
            className={cn(
              itemClass,
              active
                ? "text-foreground before:absolute before:top-0 before:inset-x-4 before:h-0.5 before:rounded-full before:bg-iris-gold-deep dark:before:bg-iris-gold"
                : "text-muted-foreground",
            )}
          >
            <span className="relative">
              <it.icon className="size-5" />
              {it.href === "/follow-ups" && <CountBadge count={followUpCount} variant="tab" />}
            </span>
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

/**
 * Phones have no top bar, so search floats in the top-right corner of every
 * page, always one tap away. Desktop keeps the Search button in the top bar.
 */
export function MobileSearchButton() {
  const { setOpen } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Search"
      className="md:hidden fixed right-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex size-10 items-center justify-center rounded-full border bg-background/95 text-foreground shadow-sm backdrop-blur-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <Search className="size-5" />
    </button>
  );
}
