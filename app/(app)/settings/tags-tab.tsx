"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadgeCell } from "@/components/data-table/cells";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { Tag, Plus, Trash2, MoreHorizontal, Pencil } from "lucide-react";
import { createTag, deleteTag, renameTag } from "@/lib/actions";
import { toast } from "sonner";

interface SettingsTagsTabProps {
  tags: { id: string; name: string; usageCount: number }[];
  isManager: boolean;
}

export function SettingsTagsTab({ tags: initialTags, isManager }: SettingsTagsTabProps) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [showDialog, setShowDialog] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<(typeof initialTags)[number] | null>(null);
  const [renameTarget, setRenameTarget] = useState<(typeof initialTags)[number] | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleCreate = async () => {
    if (!newTag.trim()) {
      toast.error("Tag name is required");
      return;
    }
    try {
      const result = await createTag(newTag);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Tag created");
      setShowDialog(false);
      setNewTag("");
      router.refresh();
    } catch {
      toast.error("Failed to create tag");
    }
  };

  const openRename = (tag: (typeof initialTags)[number]) => {
    setRenameTarget(tag);
    setRenameValue(tag.name);
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (!next) {
      toast.error("Tag name is required");
      return;
    }
    try {
      const result = await renameTag(renameTarget.id, next);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setTags(tags.map((t) => (t.id === renameTarget.id ? { ...t, name: next } : t)));
      toast.success("Tag renamed");
      setRenameTarget(null);
      router.refresh();
    } catch {
      toast.error("Failed to rename tag");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const result = await deleteTag(id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
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
                  <Plus className="size-4 mr-2" />
                  Add Tag
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Tag</DialogTitle>
                  <DialogDescription>Add a new tag to categorize clients.</DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="tagName">Tag Name</FieldLabel>
                    <Input
                      id="tagName"
                      placeholder="e.g., VIP"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    />
                  </Field>
                </FieldGroup>
                <DialogFooter className="mt-4">
                  <Button onClick={handleCreate} className="w-full">Create Tag</Button>
                </DialogFooter>
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
                  <TableHead>Usage</TableHead>
                  {isManager && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((tag) => {
                  return (
                    <TableRow key={tag.id}>
                      <TableCell className="font-medium">{tag.name}</TableCell>
                      <StatusBadgeCell label={tag.usageCount} />
                      {isManager && (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Tag actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openRename(tag)}>
                              <Pencil className="size-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(tag)}>
                              <Trash2 className="size-4 mr-2" />
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
        <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Tag</DialogTitle>
              <DialogDescription>
                Renames <strong>{renameTarget?.name}</strong> on every client and smart list that uses it.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="renameTag">New name</FieldLabel>
              <Input
                id="renameTag"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                autoFocus
              />
            </Field>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
              <Button onClick={handleRename} disabled={!renameValue.trim() || renameValue.trim() === renameTarget?.name}>
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isManager && (
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChangeAction={(open) => !open && setDeleteTarget(null)}
        title="Delete Tag"
        description={<>Are you sure you want to delete the <strong>{deleteTarget?.name}</strong> tag? This will remove it from all clients.</>}
        confirmLabel="Delete"
        onConfirmAction={() => deleteTarget && handleDelete(deleteTarget.id)}
        variant="destructive"
      />
      )}
    </>
  );
}
