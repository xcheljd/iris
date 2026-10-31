"use client";

import { useState } from "react";
import { Check, Plus, Tag as TagIcon, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { canonicalTagName, tagKey } from "@/lib/tag-names";

export interface TagOption {
  name: string;
  usageCount: number;
}

interface TagPickerProps {
  /** Tags currently chosen (shown as badges). */
  value: string[];
  /** Every known tag, most used first, for the list. */
  options: TagOption[];
  onAdd(tag: string): void;
  onRemove(tag: string): void;
  /** Allow creating a tag that doesn't exist yet. */
  creatable?: boolean;
  /** Show the chosen tags as removable badges above the trigger. */
  showSelected?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * One tag picker for every place a client gets tagged. Adapted from Kibo UI's
 * Tags (badge + popover + command, no new packages). Local changes: the chosen
 * tags sit outside the trigger so each ✕ is its own focusable button (Kibo's
 * live inside the trigger button, unreachable by keyboard); a "Create" row;
 * matching ignores capitals so "vip" picks the existing "VIP".
 */
export function TagPicker({
  value,
  options,
  onAdd,
  onRemove,
  creatable = true,
  showSelected = true,
  placeholder = "Add a tag…",
  disabled,
  className,
}: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = new Set(value.map(tagKey));
  const names = options.map((o) => o.name);
  const typed = query.trim();
  const match = typed ? names.find((n) => tagKey(n) === tagKey(typed)) : undefined;
  const canCreate = creatable && typed.length > 0 && typed.length <= 50 && !match && !chosen.has(tagKey(typed));

  const pick = (raw: string) => {
    const name = canonicalTagName(raw, names);
    if (chosen.has(tagKey(name))) onRemove(value.find((v) => tagKey(v) === tagKey(name)) ?? name);
    else onAdd(name);
    setQuery("");
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {showSelected && value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen tags">
          {value.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-50"
                  onClick={() => onRemove(tag)}
                  disabled={disabled}
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start gap-2 font-normal text-muted-foreground sm:w-64" disabled={disabled}>
            <TagIcon className="size-4" />
            {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(18rem,calc(100vw-1rem))] p-0" align="start" collisionPadding={8}>
          <Command>
            <CommandInput placeholder="Search or create a tag…" value={query} onValueChange={setQuery} maxLength={50} />
            <CommandList className="max-h-64">
              <CommandEmpty>{creatable ? "Type a name to create a tag." : "No tags found."}</CommandEmpty>
              {canCreate && (
                <CommandGroup>
                  <CommandItem value={`__create__${typed}`} onSelect={() => pick(typed)} className="gap-2">
                    <Plus className="size-4" />
                    Create &ldquo;{typed}&rdquo;
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup>
                {options.map((o) => {
                  const isChosen = chosen.has(tagKey(o.name));
                  return (
                    <CommandItem key={o.name} value={o.name} onSelect={() => pick(o.name)} className="gap-2" data-chosen={isChosen || undefined}>
                      <Check className={cn("size-4", !isChosen && "invisible")} />
                      <span className="flex-1 truncate">{o.name}</span>
                      {o.usageCount > 0 && <span className="text-xs text-muted-foreground tabular-nums">{o.usageCount}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
