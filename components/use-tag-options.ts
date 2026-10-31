"use client";

import { useEffect, useState } from "react";
import type { TagOption } from "@/components/tag-picker";

/** Known tags, most used first, for pages that don't load them on the server. */
export function useTagOptions(): TagOption[] {
  const [tags, setTags] = useState<TagOption[]>([]);
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: TagOption[]) => setTags(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);
  return tags;
}
