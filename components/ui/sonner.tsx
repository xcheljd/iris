"use client";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "dark" } = useTheme();
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // Local change (keep on refresh): success/error on our status tokens,
          // shaped like the Alert variants. Sonner injects its toast CSS
          // unlayered, which beats Tailwind's layered utilities, so these set
          // the --normal-* variables that CSS reads (the close button and icon
          // follow them too). Its description colour is hard-coded, hence `!`.
          success:
            "[--normal-bg:var(--card)] [--normal-border:color-mix(in_oklab,var(--success)_40%,transparent)] [--normal-text:var(--success)] [&_[data-description]]:text-success/90!",
          error:
            "[--normal-bg:var(--card)] [--normal-border:color-mix(in_oklab,var(--destructive)_40%,transparent)] [--normal-text:var(--destructive)] [&_[data-description]]:text-destructive/90!",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
