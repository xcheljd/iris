"use client";

import { useState, type ReactNode } from "react";
import { Copy, Mail, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { EmailText } from "@/components/email-text";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/** Digits plus an optional leading "+", the shape tel:/sms: URIs expect. */
export function phoneHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

interface PickerAction {
  label: string;
  icon: ReactNode;
  href?: string;
  onSelect?: () => void;
}

async function copyToClipboard(text: string, what: "Phone" | "Email") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied to clipboard`);
  } catch (error) {
    toast.error(`Failed to copy ${what.toLowerCase()}`, {
      description: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

const linkClass =
  "underline-offset-4 decoration-dotted underline md:no-underline hover:underline focus-visible:underline cursor-pointer";

/**
 * A contact value that opens an action picker when tapped: a bottom sheet on
 * phones (native-picker feel), a small dropdown on desktop. The trigger keeps
 * a real href, so an iPhone long-press still shows the system menu; a normal
 * tap is intercepted to open the picker instead of acting straight away.
 */
function ContactPicker({
  href,
  title,
  value,
  ariaLabel,
  actions,
  className,
  children,
}: {
  href: string;
  title: string;
  value: string;
  ariaLabel: string;
  actions: PickerAction[];
  className?: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <a
          href={href}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          className={cn(linkClass, className)}
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
        >
          {children}
        </a>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader className="text-center">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription className="[overflow-wrap:anywhere]">{value}</DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-2 px-4">
              {actions.map((a) =>
                a.href ? (
                  <Button key={a.label} asChild variant="outline" size="lg" className="h-12 justify-start gap-3 text-base">
                    <a href={a.href} onClick={() => setOpen(false)}>
                      {a.icon}
                      {a.label}
                    </a>
                  </Button>
                ) : (
                  <Button
                    key={a.label}
                    variant="outline"
                    size="lg"
                    className="h-12 justify-start gap-3 text-base"
                    onClick={() => {
                      setOpen(false);
                      a.onSelect?.();
                    }}
                  >
                    {a.icon}
                    {a.label}
                  </Button>
                ),
              )}
            </div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="ghost" size="lg" className="h-12 text-base">
                  Cancel
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <a
          href={href}
          aria-label={ariaLabel}
          className={cn(linkClass, className)}
          // Radix opens the menu on pointerdown/Enter; stop the click itself
          // from following the tel:/mailto: link.
          onClick={(e) => e.preventDefault()}
        >
          {children}
        </a>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuLabel className="font-normal text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {value}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((a) =>
          a.href ? (
            <DropdownMenuItem key={a.label} asChild>
              <a href={a.href}>
                {a.icon}
                {a.label}
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={a.label} onSelect={() => a.onSelect?.()}>
              {a.icon}
              {a.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A phone number that opens Call / Text / Copy when tapped. */
export function PhoneLink({
  phone,
  name,
  className,
  children,
}: {
  phone: string;
  /** Client name for the picker heading. */
  name?: string;
  className?: string;
  /** Display text; defaults to the phone as stored. */
  children?: ReactNode;
}) {
  const target = phoneHref(phone);
  if (!target) return <span className={className}>{children ?? phone}</span>;
  return (
    <ContactPicker
      href={`tel:${target}`}
      title={name ?? "Phone"}
      value={phone}
      ariaLabel={`Phone ${phone}, call, text or copy`}
      className={cn("whitespace-nowrap", className)}
      actions={[
        { label: "Call", icon: <Phone className="size-4" />, href: `tel:${target}` },
        { label: "Text", icon: <MessageSquare className="size-4" />, href: `sms:${target}` },
        { label: "Copy", icon: <Copy className="size-4" />, onSelect: () => copyToClipboard(phone, "Phone") },
      ]}
    >
      {children ?? phone}
    </ContactPicker>
  );
}

/** An email address that opens Email / Copy when tapped. Never truncates. */
export function EmailLink({ email, name, className }: { email: string; name?: string; className?: string }) {
  return (
    <ContactPicker
      href={`mailto:${email}`}
      title={name ?? "Email"}
      value={email}
      ariaLabel={`Email ${email}, send or copy`}
      className={cn("min-w-0", className)}
      actions={[
        { label: "Email", icon: <Mail className="size-4" />, href: `mailto:${email}` },
        { label: "Copy", icon: <Copy className="size-4" />, onSelect: () => copyToClipboard(email, "Email") },
      ]}
    >
      <EmailText email={email} />
    </ContactPicker>
  );
}
