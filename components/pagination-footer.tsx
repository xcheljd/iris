"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationFooterProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  pageSize: number;
  itemLabel?: string;
  variant?: "text" | "icons";
  showBorder?: boolean;
  extraTotal?: number;
}

export function PaginationFooter({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  itemLabel,
  variant = "text",
  showBorder = false,
  extraTotal,
}: PaginationFooterProps) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  const countText = totalItems > 0
    ? `${start}\u2013${end} of ${totalItems}${itemLabel ? ` ${itemLabel}` : ""}${extraTotal && extraTotal !== totalItems ? ` (${extraTotal} total)` : ""}`
    : `0${itemLabel ? ` ${itemLabel}` : ""}`;

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-2${showBorder ? " mt-4 pt-4 border-t" : ""}`}>
      <p className="text-xs text-muted-foreground">{countText}</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          {variant === "icons" ? <ChevronLeft className="h-4 w-4" /> : "Previous"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          {variant === "icons" ? <ChevronRight className="h-4 w-4" /> : "Next"}
        </Button>
      </div>
    </div>
  );
}
