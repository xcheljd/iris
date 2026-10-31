"use client";

import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationFooterProps {
  currentPage: number;
  totalPages: number;
  onPageChangeAction: (page: number) => void;
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
  onPageChangeAction,
  totalItems,
  pageSize,
  itemLabel,
  variant = "text",
  showBorder = false,
  extraTotal,
}: PaginationFooterProps) {
  // Single page still shows the count ("1–14 of 14 clients"); only the page
  // controls are pointless there.
  const showControls = totalPages > 1;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  const countText = totalItems > 0
    ? `${start}\u2013${end} of ${totalItems}${itemLabel ? ` ${itemLabel}` : ""}${extraTotal && extraTotal !== totalItems ? ` (${extraTotal} total)` : ""}`
    : `0${itemLabel ? ` ${itemLabel}` : ""}`;

  return (
    <Pagination
      aria-label="Pagination"
      className={`flex flex-col sm:flex-row items-center justify-between gap-2${showBorder ? " mt-4 pt-4 border-t" : ""}`}
    >
      <p className="text-xs text-muted-foreground">{countText}</p>
      {showControls && (
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChangeAction(currentPage - 1)}
            aria-label="Go to previous page"
          >
            {variant === "icons" ? <ChevronLeft className="size-4" /> : "Previous"}
          </Button>
        </PaginationItem>
        <PaginationItem className="text-xs text-muted-foreground flex items-center px-2">
          Page {currentPage} of {totalPages}
        </PaginationItem>
        <PaginationItem>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChangeAction(currentPage + 1)}
            aria-label="Go to next page"
          >
            {variant === "icons" ? <ChevronRight className="size-4" /> : "Next"}
          </Button>
        </PaginationItem>
      </PaginationContent>
      )}
    </Pagination>
  );
}
