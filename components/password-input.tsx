"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PasswordInputProps extends Omit<ComponentProps<typeof Input>, "type"> {
  wrapperClassName?: string;
}

export function PasswordInput({ wrapperClassName, className, ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("relative flex items-center rounded-md border border-input bg-transparent shadow-xs focus-within:ring-1 focus-within:ring-ring has-focus-visible:ring-1 has-focus-visible:ring-ring", wrapperClassName)}>
      <Input
        type={show ? "text" : "password"}
        className={cn("border-0 shadow-none focus-visible:ring-0 focus-visible:outline-hidden pr-9", className)}
        {...props}
      />
      <button
        type="button"
        className="absolute right-0 flex size-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
