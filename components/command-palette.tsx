"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Home, Users, Phone, ListFilter, Tag, BarChart3, Ban, MailX, Settings, Plus, Search as SearchIcon, ShieldCheck } from "lucide-react";
import { useSession } from "next-auth/react";

type ClientHit = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  /** FTS5 snippet text with [[hl]]…[[/hl]] markers wrapping matched tokens. */
  snippet: string | null;
};

/**
 * Parses an FTS5 snippet's [[hl]]…[[/hl]] sentinel markers and renders the
 * highlighted spans safely (no dangerouslySetInnerHTML). Returns a fragment.
 */
function renderSnippet(snippet: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\[\[hl\]\]([\s\S]*?)\[\[\/hl\]\]/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(snippet)) !== null) {
    if (m.index > cursor) parts.push(<span key={`p${i++}`}>{snippet.slice(cursor, m.index)}</span>);
    parts.push(<mark key={`h${i++}`} className="bg-transparent text-primary font-medium">{m[1]}</mark>);
    cursor = regex.lastIndex;
  }
  if (cursor < snippet.length) parts.push(<span key={`p${i++}`}>{snippet.slice(cursor)}</span>);
  return <>{parts}</>;
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CommandPaletteContext = React.createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const ctx = React.useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}

export function CommandPalette() {
  const router = useRouter();
  const { data: session } = useSession();
  const isManager = session?.user?.role === "manager";
  const ctx = React.useContext(CommandPaletteContext);
  // Allow standalone usage (e.g. tests render <CommandPalette /> without a Provider).
  const [localOpen, setLocalOpen] = React.useState(false);
  const open = ctx?.open ?? localOpen;
  const setOpen = ctx?.setOpen ?? setLocalOpen;
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<ClientHit[]>([]);
  const [isPhonetic, setIsPhonetic] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  React.useEffect(() => {
    const t = setTimeout(async () => {
      if (!q) { setHits([]); setIsPhonetic(false); return; }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const json = await res.json();
          setHits(json.hits ?? []);
          setIsPhonetic(Boolean(json.isPhoneticFallback));
        }
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
    ...(isManager ? [{ icon: <ShieldCheck className="h-4 w-4" />, label: "Approvals", href: "/approvals" }] : []),
    { icon: <Settings className="h-4 w-4" />, label: "Settings", href: "/settings" },
  ];

  const filteredNav = q ? navItems.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())) : navItems;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search clients, jump to pages..." value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {hits.length > 0 && (
          <CommandGroup heading={isPhonetic ? `Did you mean? (phonetic match for "${q}")` : "Clients"}>
            {hits.map((c) => (
              <CommandItem key={c.id} onSelect={() => go(`/clients/${c.id}`)} className="flex-col items-start gap-0.5">
                <div className="flex items-center gap-2 w-full">
                  <SearchIcon className="h-4 w-4 shrink-0" />
                  <span>{c.firstName} {c.lastName ?? ""}</span>
                  {c.phone && <span className="ml-auto text-xs text-muted-foreground">{c.phone}</span>}
                </div>
                {c.snippet && (
                  <div className="text-xs text-muted-foreground pl-6 truncate w-full">
                    {renderSnippet(c.snippet)}
                  </div>
                )}
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
