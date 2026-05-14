"use client";

import { useState, type ComponentType } from "react";
import { Check, ChevronDown } from "lucide-react";
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
import { cn } from "@/lib/utils";

export interface FilterSelectOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  icon: ComponentType<{ className?: string }>;
  /** Placeholder shown when no option is selected (rarely used since most filters have an "any" option). */
  placeholder: string;
  options: FilterSelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** If true, shows a search input in the popover. */
  searchable?: boolean;
  /** Tailwind width class (e.g. "md:w-40"). */
  widthClass?: string;
}

export function FilterSelect({
  icon: Icon,
  placeholder,
  options,
  value,
  onChange,
  searchable = false,
  widthClass = "md:w-40",
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("justify-between font-normal h-9", widthClass)}
        >
          <span className="flex items-center gap-2 truncate">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder="Search…" />}
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Check className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
