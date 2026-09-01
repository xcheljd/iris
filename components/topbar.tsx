"use client";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { Search, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useCommandPalette } from "@/components/command-palette";
import { useNavigationTransition } from "@/components/navigation-transition";

export function Topbar({ title, children }: { title?: string; children?: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const { state, targetTitle } = useNavigationTransition();
  const toggleTheme = () => {
    // Smooth cross-fade: enable transitions only for the duration of the switch.
    const root = document.documentElement;
    root.classList.add("theme-transitioning");
    setTheme(theme === "dark" ? "light" : "dark");
    window.setTimeout(() => root.classList.remove("theme-transitioning"), 350);
  };

  const navigating = state === "navigating" && targetTitle;
  const displayTitle = navigating ? targetTitle : title;
  const showChildren = !navigating;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 backdrop-blur-sm px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-1 h-4" />
      {displayTitle && <h1 className="text-sm font-medium">{displayTitle}</h1>}
      {showChildren && children}
      <div className="flex-1" />
      <Button variant="outline" size="sm" className="gap-2 text-muted-foreground h-8" onClick={() => setPaletteOpen(true)} data-tour="command-palette-trigger" data-hint="command-palette">
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Search</span>
        <Kbd>⌘K</Kbd>
      </Button>
      {mounted && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle theme</TooltipContent>
        </Tooltip>
      )}
    </header>
  );
}
