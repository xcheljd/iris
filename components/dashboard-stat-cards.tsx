import Link from "next/link";
import { Flame, Phone, ShoppingBag, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** The dashboard's headline stat row. */
export function DashboardStatCards({ stats }: {
  stats: { total: number; active: number; hot: number; outreachWeek: number; purchasesWeek: number };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-tour="dashboard-stats">
      <StatCard icon={Users} label="Total Clients" value={stats.total} sublabel={`${stats.active} active`} href="/clients" />
      <StatCard icon={Flame} label="Hot Leads" value={stats.hot} accent href="/clients?filter=hot" />
      {/* No client-list filter shows the same 7-day sets, so these two stay static. */}
      <StatCard icon={Phone} label="Outreach (7d)" value={stats.outreachWeek} />
      <StatCard icon={ShoppingBag} label="Purchases (7d)" value={stats.purchasesWeek} color="text-emerald-500" />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sublabel, accent, color, href }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sublabel?: string;
  accent?: boolean;
  color?: string;
  href?: string;
}) {
  const card = (
    <Card className="border-border/50 hover:border-border hover:shadow-md transition-all h-full">
      <CardContent className="p-3 md:p-4 flex items-center gap-3">
        <div className={`size-9 md:h-10 md:w-10 rounded-md flex items-center justify-center shrink-0 ${accent ? "bg-meridian-gold/15 text-meridian-gold-deep dark:text-meridian-gold" : "bg-muted text-muted-foreground"}`}>
          <Icon className="size-4 md:h-5 md:w-5" />
        </div>
        <div className="min-w-0">
          <p className={`text-xl md:text-2xl font-semibold font-mono leading-tight ${color || ""}`}>{value}</p>
          <p className="text-[11px] md:text-xs text-muted-foreground truncate">{sublabel || label}</p>
        </div>
      </CardContent>
    </Card>
  );
  if (!href) return card;
  return (
    <Link href={href} aria-label={`${label}: ${value}`} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {card}
    </Link>
  );
}
