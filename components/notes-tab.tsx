"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Calendar, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/ui/spinner";
import type { FullClient } from "@/components/client-provider";

interface ParsedNote {
  id: string;
  content: string;
  createdAt: string;
  author: string;
}

interface NotesTabProps {
  client: FullClient;
}

export function NotesTab({ client }: NotesTabProps) {
  const router = useRouter();
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error("Note cannot be empty");
      return;
    }
    // Guard against a double tap posting the same note twice.
    if (saving) return;
    setSaving(true);

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: client.id,
          text: newNote,
        }),
      });

      if (response.ok) {
        setNewNote("");
        toast.success("Note added");
        router.refresh();
      } else {
        toast.error("Failed to add note");
      }
    } catch (error) {
      toast.error("Failed to add note", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const response = await fetch(`/api/notes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
      });

      if (response.ok) {
        toast.success("Note deleted");
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error("Failed to delete note");
      }
    } catch (error) {
      toast.error("Failed to delete note", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const notes: ParsedNote[] = (client.timeline || [])
    .filter((event) => event.eventType === "note_added")
    .map((event) => ({
      id: event.id,
      content: event.description,
      createdAt: String(event.createdAt),
      author: (event as Record<string, unknown>).employeeName as string || "System",
    }));

  const sortedNotes = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            <label htmlFor="new-note">Add New Note</label>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            id="new-note"
            placeholder="Enter your note here..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            {newNote && (
              <Button variant="outline" onClick={() => setNewNote("")} disabled={saving}>
                Clear
              </Button>
            )}
            <Button onClick={handleAddNote} disabled={saving}>
              {saving ? <Spinner /> : <Plus className="size-4" />}
              {saving ? "Saving…" : "Save Note"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            Client Notes
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {sortedNotes.length} note{sortedNotes.length !== 1 ? "s" : ""} total
          </p>
        </CardHeader>
        <CardContent>
          {sortedNotes.length > 0 ? (
            <ScrollArea className="h-[400px] w-full">
              <div className="flex flex-col gap-4">
                {sortedNotes.map((note: ParsedNote) => (
                  <div key={note.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <Calendar className="size-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(note.createdAt), "MMM d, yyyy • h:mm a")}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {note.author}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(note.id)}
                        className="size-8 text-destructive hover:text-destructive"
                        aria-label="Delete note"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="text-sm">
                      {note.content}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="No notes recorded for this client"
              description="Add your first note to get started"
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChangeAction={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Note"
        description="Are you sure you want to delete this note? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirmAction={() => { if (deleteTarget) handleDeleteNote(deleteTarget); }}
      />
    </div>
  );
}
