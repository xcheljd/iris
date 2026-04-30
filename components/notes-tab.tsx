"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Calendar, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
  const [newNote, setNewNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error("Note cannot be empty");
      return;
    }

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
        setIsAdding(false);
        toast.success("Note added");
        window.location.reload();
      } else {
        toast.error("Failed to add note");
      }
    } catch (_error) {
      toast.error("Failed to add note");
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
        window.location.reload();
      } else {
        toast.error("Failed to delete note");
      }
    } catch (_error) {
      toast.error("Failed to delete note");
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Add New Note
            </CardTitle>
            {isAdding ? (
              <Button variant="outline" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
            ) : (
              <Button onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Note
              </Button>
            )}
          </div>
        </CardHeader>
        {isAdding && (
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Enter your note here..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddNote}>Save Note</Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Client Notes
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {sortedNotes.length} note{sortedNotes.length !== 1 ? "s" : ""} total
          </p>
        </CardHeader>
        <CardContent>
          {sortedNotes.length > 0 ? (
            <ScrollArea className="h-[400px] w-full">
              <div className="space-y-4">
                {sortedNotes.map((note: ParsedNote) => (
                  <div key={note.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
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
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
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
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No notes recorded for this client</p>
              <p className="text-sm mt-1">Add your first note to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Note"
        description="Are you sure you want to delete this note? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (deleteTarget) handleDeleteNote(deleteTarget); }}
      />
    </div>
  );
}
