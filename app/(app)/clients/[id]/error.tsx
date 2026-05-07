"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ClientDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h2 className="text-xl font-semibold">Failed to load client</h2>
      <p className="text-muted-foreground max-w-sm">{error.message || "An unexpected error occurred."}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.push("/clients")}>Back to clients</Button>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
