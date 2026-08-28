"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { Topbar } from "@/components/topbar";
import { ProspectActionsMenu } from "@/components/prospect-actions-menu";
import { ProspectsBulkToolbar } from "@/components/prospects-bulk-actions";
// RVX Import disabled for demo — Coming Soon
// import { RvxImportDialog } from "@/components/rvx-import-dialog";
import { Upload, UserSearch } from "lucide-react";
import Link from "next/link";
import type { ProspectListRow } from "@/lib/queries";
import { formatMoney } from "@/lib/utils";

type ProspectStatus = "active" | "graduated" | "unsubscribed" | "rejected";

const TAB_LABELS: Record<ProspectStatus, string> = {
  active: "Active Prospects",
  graduated: "Graduated Prospects",
  unsubscribed: "Unsubscribed Prospects",
  rejected: "Rejected Prospects",
};

const EMPTY_COPY: Record<ProspectStatus, { title: string; description: string }> = {
  active: {
    title: "No active prospects",
    description: "Import prospects from RVX or wait for new ones to come in.",
  },
  graduated: {
    title: "No graduated prospects",
    description: "Prospects move here once they're converted to clients.",
  },
  unsubscribed: {
    title: "No unsubscribed prospects",
    description: "Prospects who opt out of outreach will appear here.",
  },
  rejected: {
    title: "No rejected prospects",
    description: "Prospects marked as not-a-fit will appear here.",
  },
};

interface ProspectsContentProps {
  active: ProspectListRow[];
  graduated: ProspectListRow[];
  unsubscribed: ProspectListRow[];
  rejected: ProspectListRow[];
  isManager: boolean;
}

export function ProspectsContent({
  active,
  graduated,
  unsubscribed,
  rejected,
  isManager,
}: ProspectsContentProps) {
  const [search, setSearch] = useState("");
  // RVX Import disabled for demo — Coming Soon
  // const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filter = (rows: ProspectListRow[]) => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (p) =>
        p.firstName.toLowerCase().includes(q) ||
        p.lastName?.toLowerCase().includes(q) ||
        p.phone?.includes(q) ||
        p.email?.toLowerCase().includes(q),
    );
  };

  const filteredActive = filter(active);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allIds = filteredActive.map((p) => p.id);
    const allSelected = allIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...allIds]));
    }
  };

  const clearSelected = () => setSelected(new Set());

  const selectedInView = filteredActive.filter((p) => selected.has(p.id)).map((p) => p.id);
  const allInViewSelected = filteredActive.length > 0 && filteredActive.every((p) => selected.has(p.id));
  const someInViewSelected = filteredActive.some((p) => selected.has(p.id)) && !allInViewSelected;

  return (
    <>
      <Topbar title="Prospects">
        {isManager && (
          <Button size="sm" disabled>
            <Upload className="size-4 mr-2" />
            Import RVX
            <Badge variant="secondary" className="ml-2 text-[10px]">Coming Soon</Badge>
          </Button>
        )}
      </Topbar>

      <div className="flex flex-col flex-1 p-4 md:p-6 gap-4" data-tour="prospects">
        <SearchInput
          value={search}
          onChangeAction={setSearch}
          placeholder="Search by name, phone, or email..."
          className="max-w-sm"
        />

        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">
              Active
              {active.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {active.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="graduated">Graduated</TabsTrigger>
            <TabsTrigger value="unsubscribed">Unsubscribed</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{TAB_LABELS.active}</CardTitle>
                  {filteredActive.length > 0 && (
                    <Badge variant="secondary">
                      {filteredActive.length} prospect{filteredActive.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                {selected.size > 0 && (
                  <ProspectsBulkToolbar
                    selectedIds={selectedInView.length > 0 ? Array.from(selected) : []}
                    onClearAction={clearSelected}
                  />
                )}
              </CardHeader>
              <CardContent>
                {filteredActive.length === 0 ? (
                  <EmptyState
                    icon={UserSearch}
                    title={search.trim() ? "No matching prospects" : EMPTY_COPY.active.title}
                    description={search.trim() ? "Try a different search term" : EMPTY_COPY.active.description}
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 px-1 pb-1">
                      <Checkbox
                        checked={allInViewSelected ? true : someInViewSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                      <span className="text-xs text-muted-foreground">Select all</span>
                    </div>
                    {filteredActive.map((prospect) => (
                      <div
                        key={prospect.id}
                        className="border rounded-lg p-4 flex items-center gap-3"
                      >
                        <Checkbox
                          checked={selected.has(prospect.id)}
                          onCheckedChange={() => toggleOne(prospect.id)}
                          aria-label={`Select ${prospect.firstName} ${prospect.lastName ?? ""}`}
                        />
                        <Link
                          href={`/prospects/${prospect.id}`}
                          className="flex-1 min-w-0 hover:underline"
                        >
                          <p className="font-medium truncate">
                            {prospect.firstName} {prospect.lastName ?? ""}
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                            {prospect.phone && (
                              <span className="text-xs text-muted-foreground">{prospect.phone}</span>
                            )}
                            {prospect.email && (
                              <span className="text-xs text-muted-foreground truncate">{prospect.email}</span>
                            )}
                            {prospect.rvxSpend !== null && prospect.rvxSpend !== undefined && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {formatMoney(prospect.rvxSpend)}
                              </span>
                            )}
                          </div>
                        </Link>
                        <ProspectActionsMenu prospect={prospect} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="graduated" className="mt-4">
            <ProspectListCard rows={filter(graduated)} status="graduated" search={search} />
          </TabsContent>
          <TabsContent value="unsubscribed" className="mt-4">
            <ProspectListCard rows={filter(unsubscribed)} status="unsubscribed" search={search} />
          </TabsContent>
          <TabsContent value="rejected" className="mt-4">
            <ProspectListCard rows={filter(rejected)} status="rejected" search={search} />
          </TabsContent>
        </Tabs>

        {/* RVX Import disabled for demo — Coming Soon */}
        {/* <RvxImportDialog open={importOpen} onOpenChangeAction={setImportOpen} /> */}
      </div>
    </>
  );
}

function ProspectListCard({
  rows,
  status,
  search,
}: {
  rows: ProspectListRow[];
  status: ProspectStatus;
  search: string;
}) {
  const filtered = search.trim().length > 0;
  const copy = EMPTY_COPY[status];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{TAB_LABELS[status]}</CardTitle>
          {rows.length > 0 && (
            <Badge variant="secondary">
              {rows.length} prospect{rows.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={UserSearch}
            title={filtered ? "No matching prospects" : copy.title}
            description={filtered ? "Try a different search term" : copy.description}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((prospect) => (
              <div
                key={prospect.id}
                className="border rounded-lg p-4 flex items-center justify-between gap-3"
              >
                <Link
                  href={`/prospects/${prospect.id}`}
                  className="flex-1 min-w-0 hover:underline"
                >
                  <p className="font-medium truncate">
                    {prospect.firstName} {prospect.lastName ?? ""}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                    {prospect.phone && (
                      <span className="text-xs text-muted-foreground">{prospect.phone}</span>
                    )}
                    {prospect.email && (
                      <span className="text-xs text-muted-foreground truncate">{prospect.email}</span>
                    )}
                    {prospect.rvxSpend !== null && prospect.rvxSpend !== undefined && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatMoney(prospect.rvxSpend)}
                      </span>
                    )}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
