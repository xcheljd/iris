"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  X, 
  Tag, 
  Hash, 
  Search,
  Palette,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import type { FullClient } from "@/components/client-provider";

interface TagsTabProps {
  client: FullClient;
}

export function TagsTab({ client }: TagsTabProps) {
  const router = useRouter();
  const [newTag, setNewTag] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleAddTag = async () => {
    if (!newTag.trim()) {
      toast.error("Tag cannot be empty");
      return;
    }

    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: client.id,
          tag: newTag.trim(),
        }),
      });

      if (response.ok) {
        setNewTag("");
        setIsAdding(false);
        toast.success("Tag added");
        router.refresh();
      } else {
        toast.error("Failed to add tag");
      }
    } catch (error) {
      toast.error("Failed to add tag", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleRemoveTag = async (tag: string) => {
    try {
      const response = await fetch("/api/tags", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: client.id,
          tag,
        }),
      });

      if (response.ok) {
        toast.success("Tag removed");
        router.refresh();
      } else {
        toast.error("Failed to remove tag");
      }
    } catch (error) {
      toast.error("Failed to remove tag", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const availableTags = client.allTags?.map((tag) => tag.name) || [
    "VIP", "repeat-buyer", "high-spender", "military", "birthday-this-month",
    "talker", "no-texts", "email-only", "crimson-ace", "meridian", "solar",
    "limited-edition", "mens", "womens", "watch", "collector"
  ];

  const allTags = Array.from(new Set(availableTags)) as string[];
  
  const clientTags = client.tags || [];
  const filteredTags = clientTags.filter((tag: string) =>
    tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Common tag suggestions
  const commonTags = ["VIP", "repeat-buyer", "high-spender", "military", "birthday-this-month"];

  return (
    <div className="space-y-4">
      {/* Current Tags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Current Tags
          </CardTitle>
          {clientTags.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {clientTags.length} tag{clientTags.length !== 1 ? "s" : ""} assigned
            </p>
          )}
        </CardHeader>
        <CardContent>
          {clientTags.length > 0 ? (
            <div className="space-y-3">
              {/* Tag Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Tag List */}
              <div className="space-y-2">
                {filteredTags.map((tag: string) => {
                  const tagRecord = client.allTags?.find((t) => t.name === tag);
                  return (
                    <div
                      key={tag}
                      className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Palette className="h-3.5 w-3.5" style={{ color: tagRecord?.color || undefined }} />
                        <Badge variant="secondary" className="cursor-pointer">
                          {tag}
                        </Badge>
                        {tagRecord && tagRecord.usageCount > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {tagRecord.usageCount}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveTag(tag)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`Remove tag ${tag}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Add New Tag */}
              <div className="pt-3 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsAdding(true)}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Tag
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Tag}
              title="No tags assigned to this client"
              action={{ label: "Add First Tag", onClick: () => setIsAdding(true), icon: Plus }}
              compact
            />
          )}
        </CardContent>
      </Card>

      {/* Add Tag Dialog */}
      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Tag</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Enter tag name..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddTag();
                }
              }}
            />
            
            {/* Tag Suggestions */}
            {newTag.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Common tags:</p>
                <div className="flex flex-wrap gap-2">
                  {commonTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                      onClick={() => setNewTag(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddTag}>
                Add Tag
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Available Tags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Available Tags
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {allTags.length} total tags in the system
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px] w-full">
            <div className="space-y-2">
              {allTags.map((tag: string) => (
                <div
                  key={tag}
                  className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors"
                >
                  <Badge variant="outline">
                    {tag}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewTag(tag)}
                    disabled={clientTags.includes(tag)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}