"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Home, Users, Phone, ListFilter, Tag, BarChart3, Ban, MailX, Settings, Plus, Search as SearchIcon } from "lucide-react";

type ClientHit = { id: string; firstName: string; lastName: string | null; phone: string | null };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<ClientHit[]>([]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(async () => {
      if (!q) { setHits([]); return; }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setHits(await res.json());
      } catch {}
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };

  const navItems = [
    { icon: <Home className="h-4 w-4" />, label: "Dashboard", href: "/" },
    { icon: <Users className="h-4 w-4" />, label: "Clients", href: "/clients" },
    { icon: <Phone className="h-4 w-4" />, label: "Follow-Ups", href: "/follow-ups" },
    { icon: <ListFilter className="h-4 w-4" />, label: "Smart Lists", href: "/smart-lists" },
    { icon: <Tag className="h-4 w-4" />, label: "Promos", href: "/promos" },
    { icon: <BarChart3 className="h-4 w-4" />, label: "Analytics", href: "/analytics" },
    { icon: <Ban className="h-4 w-4" />, label: "Banned", href: "/banned" },
    { icon: <MailX className="h-4 w-4" />, label: "Unsubscribed", href: "/unsubscribed" },
    { icon: <Settings className="h-4 w-4" />, label: "Settings", href: "/settings" },
  ];

  const filteredNav = q ? navItems.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())) : navItems;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search clients, jump to pages..." value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {hits.length > 0 && (
          <CommandGroup heading="Clients">
            {hits.map((c) => (
              <CommandItem key={c.id} onSelect={() => go(`/clients/${c.id}`)}>
                <SearchIcon className="h-4 w-4" />
                <span>{c.firstName} {c.lastName ?? ""}</span>
                {c.phone && <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          {filteredNav.map((n) => (
            <CommandItem key={n.href} onSelect={() => go(n.href)}>{n.icon} {n.label}</CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go("/clients/new")}><Plus className="h-4 w-4" /> New Client</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
