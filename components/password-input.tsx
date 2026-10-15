"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

interface PasswordInputProps extends Omit<ComponentProps<typeof InputGroupInput>, "type"> {
  wrapperClassName?: string;
}

/** Password field with a show/hide toggle, built on ui/input-group. */
export function PasswordInput({ wrapperClassName, ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <InputGroup className={wrapperClassName}>
      <InputGroupInput type={show ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          className="size-7"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
