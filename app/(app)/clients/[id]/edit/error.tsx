"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/topbar";

export default function EditClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <Topbar title="Edit Client" />
      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Couldn&apos;t load this client</h2>
          <p className="text-muted-foreground text-sm">
            {error.message || "Something went wrong."}
          </p>
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </>
  );
}
