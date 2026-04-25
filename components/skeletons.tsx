import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex-1 p-4 md:p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ClientListSkeleton() {
  return (
    <div className="flex-1 p-4 md:p-6 space-y-4">
      <Card className="p-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-48" />
        </div>
      </Card>
      <Card>
        <div className="p-4 space-y-1">
          <div className="flex gap-4 pb-3 border-b">
            {["Name", "Contact", "Heat", "Tags", "Owner", "Last"].map((h) => (
              <Skeleton key={h} className="h-4 flex-1" />
            ))}
          </div>
          <TableSkeleton rows={8} cols={6} />
        </div>
      </Card>
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
