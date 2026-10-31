"use client";

import { useTransition } from "react";
import { Tag } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TagPicker } from "@/components/tag-picker";
import { addTag, removeTag } from "@/lib/actions";
import type { FullClient } from "@/components/client-provider";

interface TagsTabProps {
  client: FullClient;
}

/** The client's tags: one picker to add (or create) and remove them. */
export function TagsTab({ client }: TagsTabProps) {
  const [pending, startTransition] = useTransition();
  const clientTags = (client.tags || []) as string[];
  const options = (client.allTags ?? []).map((t) => ({ name: t.name, usageCount: t.usageCount }));

  const run = (action: () => Promise<{ error?: string } | undefined | void>, done: string, failed: string) =>
    startTransition(async () => {
      try {
        const result = await action();
        if (result && "error" in result && result.error) toast.error(result.error);
        else toast.success(done);
      } catch {
        toast.error(failed);
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="size-5" />
          Tags
        </CardTitle>
        <CardDescription>
          {clientTags.length > 0
            ? `${clientTags.length} tag${clientTags.length === 1 ? "" : "s"} assigned`
            : "No tags yet. Pick an existing tag or type a new one."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TagPicker
          value={clientTags}
          options={options}
          disabled={pending}
          onAdd={(tag) => run(() => addTag(client.id, tag), "Tag added", "Failed to add tag")}
          onRemove={(tag) => run(() => removeTag(client.id, tag), "Tag removed", "Failed to remove tag")}
        />
      </CardContent>
    </Card>
  );
}
