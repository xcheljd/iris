"use client";
import { useSyncExternalStore } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { Search, Moon, Sun } from "lucide-react";
import { useCommandPalette } from "@/components/command-palette";
import { useNavigationTransition } from "@/components/navigation-transition";
import { getShortcutText } from "@/components/onboarding/hint-definitions";
import { BackupBanner } from "@/components/backup-banner";
import { cn } from "@/lib/utils";
import { useThemeToggle } from "@/hooks/use-theme-toggle";

const subscribeNoop = () => () => {};

// Phones (<md) have no top bar: the bottom tab bar's More opens the menu, the
// theme switch lives in that menu, and search floats top-right (MobileSearchButton
// in mobile-nav.tsx). What's left here on phones is the page name + page actions
// as a plain row that scrolls away. Detail pages already show a big name heading,
// so they pass phoneHeader={false} to skip the row entirely.
export function Topbar({ title, children, phoneHeader = true }: { title?: string; children?: React.ReactNode; phoneHeader?: boolean }) {
  const toggleTheme = useThemeToggle();
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const { state, targetTitle } = useNavigationTransition();
  // The server can't see the platform; hydrate as non-Mac, then correct.
  const shortcut = useSyncExternalStore(subscribeNoop, getShortcutText, () => "Ctrl+K");

  const navigating = state === "navigating" && targetTitle;
  const displayTitle = navigating ? targetTitle : title;
  const showChildren = !navigating;

  return (
    <>
    <header className={cn(
      "flex h-14 items-center gap-2 px-4 max-md:pr-16 md:sticky md:top-0 md:z-30 md:border-b md:bg-background/95 md:backdrop-blur-sm",
      !phoneHeader && "max-md:hidden",
    )}>
      <SidebarTrigger className="max-md:hidden" />
      <Separator orientation="vertical" className="mx-1 h-4 max-md:hidden" />
      {displayTitle && <h1 className="text-lg font-semibold md:text-sm md:font-medium">{displayTitle}</h1>}
      {showChildren && children}
      <div className="flex-1" />
      <Button variant="outline" size="sm" className="gap-2 text-muted-foreground h-8 max-md:hidden" onClick={() => setPaletteOpen(true)} data-tour="command-palette-trigger" data-hint="command-palette">
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Search</span>
        <Kbd className="hidden sm:inline-flex">{shortcut}</Kbd>
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 max-md:hidden" onClick={toggleTheme} aria-label="Toggle theme">
            {/* Swapped by the class-based `dark` variant, so it server-renders without a mount gate. */}
            <Sun className="size-4 hidden dark:block" />
            <Moon className="size-4 dark:hidden" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle theme</TooltipContent>
      </Tooltip>
    </header>
    {/* Desktop only (X's call): phones skip the reminder; managers back up from Settings → Backup. */}
    <BackupBanner className="max-md:hidden" />
    </>
  );
}
