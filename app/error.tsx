"use client";

import { ErrorScreen } from "@/components/error-screen";

// Outside the (app) shell: no sidebar/command-palette providers, so no top bar.
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex min-h-svh flex-col">
      <ErrorScreen error={error} retry={retry} withTopbar={false} />
    </div>
  );
}
