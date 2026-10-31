"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Home, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/topbar";

/**
 * The one "page crashed" screen behind every error.tsx (X's wording, 10/17).
 * Never shows error.message: in dev it's the raw server text, in production
 * server errors are already replaced by a generic sentence, and client errors
 * keep their raw text. The digest (server errors only) is the reference code
 * that matches the server log line.
 *
 * `retry` re-fetches and re-renders the segment (Next 16.3+); the old `reset`
 * only re-rendered, so a server error could never recover.
 */
export function ErrorScreen({
  error,
  retry,
  title,
  withTopbar = true,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  /** Top bar title (desktop). */
  title?: string;
  /** False outside the app shell (the root error boundary has no providers). */
  withTopbar?: boolean;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      {withTopbar && <Topbar title={title} phoneHeader={false} />}
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle className="size-10 text-destructive" aria-hidden />
        <h2 className="text-xl font-semibold">This page couldn&apos;t load</h2>
        <p className="text-muted-foreground max-w-sm">Try again, or go back to the Dashboard.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/"><Home className="size-4" />Go to Dashboard</Link>
          </Button>
          <Button onClick={() => retry()}>
            <RotateCw className="size-4" />Try again
          </Button>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground">
            Reference code: <code className="font-mono select-all">{error.digest}</code>
          </p>
        )}
      </div>
    </>
  );
}
