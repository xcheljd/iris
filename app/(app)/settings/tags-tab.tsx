"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tag, Plus, Trash2, MoreHorizontal } from "lucide-react";
import { createTag, deleteTag } from "@/lib/actions";
import { toast } from "sonner";

export const tagColors = [
  { name: "blue", class: "bg-blue-500" },
  { name: "green", class: "bg-green-500" },
  { name: "red", class: "bg-red-500" },
  { name: "yellow", class: "bg-yellow-500" },
  { name: "purple", class: "bg-purple-500" },
  { name: "orange", class: "bg-orange-500" },
  { name: "pink", class: "bg-pink-500" },
  { name: "gray", class: "bg-gray-500" },
];

interface TagsTabProps {
  tags: { id: string; name: string; color: string; usageCount: number }[];
  isManager: boolean;
}

export function TagsTab({ tags: initialTags, isManager }: TagsTabProps) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [showDialog, setShowDialog] = useState(false);
  const [newTag, setNewTag] = useState({ name: "", color: "blue" });
  const [deleteTarget, setDeleteTarget] = useState<(typeof initialTags)[number] | null>(null);

  const handleCreate = async () => {
    if (!newTag.name.trim()) {
      toast.error("Tag name is required");
      return;
    }
    try {
      await createTag(newTag.name, newTag.color);
      toast.success("Tag created");
      setShowDialog(false);
      setNewTag({ name: "", color: "blue" });
      router.refresh();
    } catch {
      toast.error("Failed to create tag");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTag(id);
      setTags(tags.filter((t) => t.id !== id));
      toast.success("Tag deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete tag");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Client Tags</CardTitle>
              <CardDescription>
                {tags.length} tags available for client categorization
              </CardDescription>
            </div>
            {isManager && (
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tag
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Tag</DialogTitle>
                  <DialogDescription>Add a new tag to categorize clients.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="tagName">Tag Name</Label>
                    <Input id="tagName" placeholder="e.g., VIP" value={newTag.name} onChange={(e) => setNewTag({ ...newTag, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex flex-wrap gap-2">
                      {tagColors.map((color) => (
                        <button
                          key={color.name}
                          className={`w-8 h-8 rounded-full ${color.class} ${
                            newTag.color === color.name ? "ring-2 ring-offset-2 ring-offset-background ring-primary" : ""
                          }`}
                          onClick={() => setNewTag({ ...newTag, color: color.name })}
                        />
                      ))}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreate} className="w-full">Create Tag</Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No tags created"
              description="Create tags to categorize your clients"
            />
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead className="hidden sm:table-cell">Color</TableHead>
                  <TableHead>Usage</TableHead>
                  {isManager && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((tag) => {
                  const colorObj = tagColors.find((c) => c.name === tag.color);
                  return (
                    <TableRow key={tag.id}>
                      <TableCell className="font-medium">{tag.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full ${colorObj?.class || "bg-gray-500"}`} />
                          <span className="text-sm text-muted-foreground">{tag.color}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{tag.usageCount}</Badge>
                      </TableCell>
                      {isManager && (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Tag actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(tag)}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {isManager && (
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Tag"
        description={<>Are you sure you want to delete the <strong>{deleteTarget?.name}</strong> tag? This will remove it from all clients.</>}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        variant="destructive"
      />
      )}
    </>
  );
}
