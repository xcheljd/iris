"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Phone, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/follow-ups", label: "Follow", icon: Phone },
  { href: "/analytics", label: "Stats", icon: BarChart3 },
  { href: "/settings", label: "More", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t bg-background/95 backdrop-blur">
      {items.map((it) => {
        const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={cn("flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]", active ? "text-accent" : "text-muted-foreground")}>
            <it.icon className="size-5" />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
