"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function EditClientError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} title="Edit Client" />;
}
