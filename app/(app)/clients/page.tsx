import { Topbar } from "@/components/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HeatBadge } from "@/components/heat-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getClientsWithEmployee, applyClientFilter } from "@/lib/queries";
import { formatPhone, daysAgo } from "@/lib/utils";
import Link from "next/link";
import { Plus, Search } from "lucide-react";

export default async function ClientListPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; heat?: string }> }) {
  const sp = await searchParams;
  const rows = await getClientsWithEmployee();
  const q = (sp.q || "").toLowerCase();
  const filter = sp.filter || null;
  const heat = sp.heat || null;
  let list = rows;
  if (q) {
    list = list.filter((r) =>
      `${r.client.firstName} ${r.client.lastName ?? ""}`.toLowerCase().includes(q) ||
      (r.client.email ?? "").toLowerCase().includes(q) ||
      (r.client.phone ?? "").includes(q)
    );
  }
  if (heat && heat !== "any") list = list.filter((r) => r.client.heatLevel === heat);
  const filtered = applyClientFilter(list.map((r) => r.client), filter);
  const filteredIds = new Set(filtered.map((c) => c.id));
  const final = list.filter((r) => filteredIds.has(r.client.id));

  return (
    <>
      <Topbar title="Clients">
        <Button asChild variant="gold" size="sm">
          <Link href="/clients/new"><Plus className="h-4 w-4 mr-1" /> Add Client</Link>
        </Button>
      </Topbar>
      <main className="flex-1 p-4 md:p-6 space-y-4">
        <Card className="p-3">
          <form className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input name="q" defaultValue={sp.q || ""} placeholder="Search name, email, phone…" className="pl-8" />
            </div>
            <Select name="heat" defaultValue={sp.heat || "any"}>
              <SelectTrigger className="md:w-40"><SelectValue placeholder="Heat" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any heat</SelectItem>
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="cold">Cold</SelectItem>
              </SelectContent>
            </Select>
            <Select name="filter" defaultValue={sp.filter || "all"}>
              <SelectTrigger className="md:w-48"><SelectValue placeholder="Filter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                <SelectItem value="hot">Hot only</SelectItem>
                <SelectItem value="stale">Stale (90+ days)</SelectItem>
                <SelectItem value="recent_purchases">Recent purchases</SelectItem>
                <SelectItem value="no_outreach_60">No outreach 60d</SelectItem>
                <SelectItem value="birthdays_month">Birthdays this month</SelectItem>
                <SelectItem value="email_subscribers">Email subscribers</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline" size="sm">Apply</Button>
          </form>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Heat</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Last contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {final.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No clients match.</TableCell></TableRow>
              ) : final.map((r) => {
                const d = daysAgo(r.client.lastOutreachAt);
                return (
                  <TableRow key={r.client.id} className="hover:bg-muted/30">
                    <TableCell>
                      <Link href={`/clients/${r.client.id}`} className="font-medium hover:underline">
                        {r.client.firstName} {r.client.lastName ?? ""}
                      </Link>
                      {r.client.status !== "active" && <Badge variant="outline" className="ml-2 text-[10px] capitalize">{r.client.status}</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">{formatPhone(r.client.phone)}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.client.email}</div>
                    </TableCell>
                    <TableCell><HeatBadge level={r.client.heatLevel} score={r.client.heatScore} showScore /></TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap max-w-[180px]">
                        {(r.client.tags || []).slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.employeeName ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d === null ? "Never" : d === 0 ? "Today" : `${d}d ago`}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
        <p className="text-xs text-muted-foreground">{final.length} of {rows.length} clients</p>
      </main>
    </>
  );
}
