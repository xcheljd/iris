"use client";

import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";

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
    <div className={`text-center ${compact ? "py-8" : "py-12"} text-muted-foreground`}>
      {Icon && (
        <Icon className="h-12 w-12 mx-auto mb-3 opacity-50" />
      )}
      {title && <p className="text-lg font-medium">{title}</p>}
      {description && <p className={`text-sm mt-1 ${action ? "mb-4" : ""}`}>{description}</p>}
      {action && (
        <Button variant="outline" onClick={action.onClick} className="mt-4">
          {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
