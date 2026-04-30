"use client";

import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: ComponentType<{ className?: string }>;
}

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title?: string;
  description?: string;
  action?: EmptyStateAction;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, compact }: EmptyStateProps) {
  const ActionIcon = action?.icon;
  return (
    <Empty className={compact ? "py-8" : "py-12"}>
      <EmptyHeader>
        {Icon && (
          <EmptyMedia variant="icon">
            <Icon className="size-6" />
          </EmptyMedia>
        )}
        {title && <EmptyTitle>{title}</EmptyTitle>}
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && (
        <EmptyContent>
          <Button variant="outline" onClick={action.onClick}>
            {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
            {action.label}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
