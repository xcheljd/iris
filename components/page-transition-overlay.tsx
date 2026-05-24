"use client";

import { useMemo, type ReactNode } from "react";
import { useNavigationTransition } from "./navigation-transition";
import {
  DashboardSkeleton,
  ClientListSkeleton,
  ClientDetailSkeleton,
  ClientFormSkeleton,
  FollowUpsSkeleton,
  SmartListsSkeleton,
  PromosSkeleton,
  AnalyticsSkeleton,
  CollectionsSkeleton,
  BannedSkeleton,
  UnsubscribedSkeleton,
  ApprovalsSkeleton,
  SettingsSkeleton,
  ProspectsSkeleton,
  ProspectDetailSkeleton,
  CatalogSkeleton,
} from "./skeletons";
import { Skeleton } from "./ui/skeleton";
import { Card, CardContent, CardHeader } from "./ui/card";

function ChangePasswordSkeleton() {
  return (
    <div className="flex-1 p-4 md:p-6 max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function skeletonForPath(href: string): ReactNode {
  const path = href.replace(/\/+$/, "") || "/";

  const exact: Record<string, ReactNode> = {
    "/": <DashboardSkeleton />,
    "/clients": <ClientListSkeleton />,
    "/follow-ups": <FollowUpsSkeleton />,
    "/smart-lists": <SmartListsSkeleton />,
    "/promos": <PromosSkeleton />,
    "/analytics": <AnalyticsSkeleton />,
    "/analytics/collections": <CollectionsSkeleton />,
    "/banned": <BannedSkeleton />,
    "/unsubscribed": <UnsubscribedSkeleton />,
    "/approvals": <ApprovalsSkeleton />,
    "/settings": <SettingsSkeleton />,
    "/prospects": <ProspectsSkeleton />,
    "/catalog": <CatalogSkeleton />,
    "/clients/new": <ClientFormSkeleton />,
    "/change-password": <ChangePasswordSkeleton />,
  };

  if (exact[path]) return exact[path];

  if (path.startsWith("/clients/") && path.endsWith("/edit")) {
    return <ClientDetailSkeleton />;
  }
  if (path.startsWith("/clients/")) {
    return <ClientDetailSkeleton />;
  }
  if (path.startsWith("/prospects/")) {
    return <ProspectDetailSkeleton />;
  }

  return <DashboardSkeleton />;
}

export function PageTransitionOverlay() {
  const { state, targetPath } = useNavigationTransition();

  const skeleton = useMemo(() => {
    if (state !== "navigating" || !targetPath) return null;
    return skeletonForPath(targetPath);
  }, [state, targetPath]);

  if (!skeleton) return null;

  return (
    <div
      className="absolute inset-0 z-10 bg-background animate-in fade-in duration-150 overflow-y-auto pt-14"
      aria-hidden="true"
    >
      {skeleton}
    </div>
  );
}
