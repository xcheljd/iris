"use client";

import { useState } from "react";
import { Check, ChevronDown, Tag as TagIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagOption {
  name: string;
  usageCount: number;
}

interface ClientsTagFilterProps {
  allTags: TagOption[];
  selected: string[];
  mode: "any" | "all";
  onChange: (next: { selected: string[]; mode: "any" | "all" }) => void;
}

export function ClientsTagFilter({ allTags, selected, mode, onChange }: ClientsTagFilterProps) {
  const [open, setOpen] = useState(false);

  const toggleTag = (name: string) => {
    const next = selected.includes(name)
      ? selected.filter((t) => t !== name)
      : [...selected, name];
    onChange({ selected: next, mode });
  };

  const clearAll = () => onChange({ selected: [], mode });
  const setMode = (m: "any" | "all") => onChange({ selected, mode: m });

  const hasSelection = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "md:w-44 justify-between font-normal h-9",
            !hasSelection && "text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <TagIcon className="h-4 w-4 shrink-0" />
            {hasSelection ? (
              <span className="truncate">
                {selected.length === 1 ? selected[0] : `${selected.length} tags`}
              </span>
            ) : (
              "Tags"
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
          <span className="text-muted-foreground">Match</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setMode("any")}
              className={cn(
                "rounded px-2 py-0.5 transition-colors",
                mode === "any" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              Any
            </button>
            <button
              type="button"
              onClick={() => setMode("all")}
              className={cn(
                "rounded px-2 py-0.5 transition-colors",
                mode === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              All
            </button>
          </div>
        </div>
        <Command>
          <CommandInput placeholder="Search tags…" />
          <CommandList>
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup>
              {allTags.map((tag) => {
                const isSelected = selected.includes(tag.name);
                return (
                  <CommandItem
                    key={tag.name}
                    value={tag.name}
                    onSelect={() => toggleTag(tag.name)}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border",
                        isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30",
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className="flex-1 truncate">{tag.name}</span>
                    {tag.usageCount > 0 && (
                      <Badge variant="secondary" className="text-[10px]">{tag.usageCount}</Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {hasSelection && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full justify-center text-xs" onClick={clearAll}>
              <X className="h-3 w-3 mr-1" />
              Clear selection
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
