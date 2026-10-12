"use client";

import { MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Digits plus an optional leading "+", the shape tel:/sms: URIs expect. */
export function phoneHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/**
 * Call and Text icon buttons for a phone number. On phones they open the
 * dialer / messages app; on desktop the OS hands them to whatever is
 * registered (FaceTime, Phone Link, Messages).
 */
export function PhoneActions({ phone, className }: { phone: string; className?: string }) {
  const target = phoneHref(phone);
  if (!target) return null;
  return (
    // Own provider so the buttons work in any tree (tests, portals) without
    // relying on the app-level TooltipProvider; nesting providers is fine.
    <TooltipProvider>
      <span className={cn("inline-flex items-center gap-0.5 shrink-0", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" asChild>
              <a href={`tel:${target}`} aria-label={`Call ${phone}`}>
                <Phone className="size-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Call</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" asChild>
              <a href={`sms:${target}`} aria-label={`Text ${phone}`}>
                <MessageSquare className="size-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Text</TooltipContent>
        </Tooltip>
      </span>
    </TooltipProvider>
  );
}
