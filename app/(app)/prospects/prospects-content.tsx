"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { Topbar } from "@/components/topbar";
import { ProspectActionsMenu } from "@/components/prospect-actions-menu";
import { RvxImportDialog } from "@/components/rvx-import-dialog";
import { Upload, UserSearch, DollarSign } from "lucide-react";
import Link from "next/link";
import type { ProspectListRow } from "@/lib/queries";

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
  const [importOpen, setImportOpen] = useState(false);

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

  return (
    <>
      <Topbar title="Prospects">
        {isManager && (
          <Button onClick={() => setImportOpen(true)} size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Import RVX
          </Button>
        )}
      </Topbar>

      <div className="flex-1 p-4 md:p-6 space-y-4" data-tour="prospects">
        <SearchInput
          value={search}
          onChange={setSearch}
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
            <ProspectTable rows={filter(active)} showActions />
          </TabsContent>
          <TabsContent value="graduated" className="mt-4">
            <ProspectTable rows={filter(graduated)} />
          </TabsContent>
          <TabsContent value="unsubscribed" className="mt-4">
            <ProspectTable rows={filter(unsubscribed)} />
          </TabsContent>
          <TabsContent value="rejected" className="mt-4">
            <ProspectTable rows={filter(rejected)} />
          </TabsContent>
        </Tabs>

        <RvxImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </div>
    </>
  );
}

function ProspectTable({
  rows,
  showActions = false,
}: {
  rows: ProspectListRow[];
  showActions?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={UserSearch}
        title="No prospects here"
        compact
      />
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((prospect) => (
        <Card key={prospect.id}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
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
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <DollarSign className="h-3 w-3" />
                    {prospect.rvxSpend.toFixed(2)}
                  </span>
                )}
              </div>
            </Link>
            {showActions && <ProspectActionsMenu prospect={prospect} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
