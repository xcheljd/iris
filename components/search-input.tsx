"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

interface SearchInputProps {
  value: string;
  onChangeAction: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Accessible name; falls back to the placeholder. */
  "aria-label"?: string;
}

/** Search field with a leading icon and a clear button, built on ui/input-group. */
export function SearchInput({
  value,
  onChangeAction,
  placeholder = "Search…",
  className,
  "aria-label": ariaLabel,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <InputGroup className={className}>
      <InputGroupInput
        ref={inputRef}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChangeAction(e.target.value)}
      />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            className="size-7"
            onClick={() => {
              onChangeAction("");
              // The clear button unmounts once empty; keep focus in the field.
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
