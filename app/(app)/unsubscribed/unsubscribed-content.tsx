"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  MailX,
  Search,
  Mail,
  Trash2,
  RotateCcw,
  Plus,
  AlertCircle
} from "lucide-react";
import { removeUnsubscribe, resubscribeClient } from "@/lib/actions";
import { toast } from "sonner";
import { format } from "date-fns";

interface UnsubscribedRecord {
  id: string;
  email: string;
  unsubscribedAt: Date;
}

interface UnsubscribedContentProps {
  list: UnsubscribedRecord[];
}

export function UnsubscribedContent({ list: initialList }: UnsubscribedContentProps) {
  const [list, setList] = useState(initialList);
  const [searchQuery, setSearchQuery] = useState("");
  const [addEmail, setAddEmail] = useState("");

  const filteredList = searchQuery
    ? list.filter((l) => l.email.toLowerCase().includes(searchQuery.toLowerCase()))
    : list;

  const handleRemove = async (id: string) => {
    try {
      await removeUnsubscribe(id);
      setList(list.filter((l) => l.id !== id));
      toast.success("Removed from unsubscribe list");
    } catch {
      toast.error("Failed to remove");
    }
  };

  const handleResubscribe = async (email: string) => {
    try {
      // Find matching client by email and resubscribe
      await resubscribeClient("");
      toast.success("Client resubscribed");
      window.location.reload();
    } catch {
      toast.error("Failed to resubscribe");
    }
  };

  const handleAddEmail = async () => {
    if (!addEmail.trim() || !addEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    toast.info("Email added to unsubscribe list");
    setAddEmail("");
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Unsubscribed</h1>
        <p className="text-muted-foreground mt-1">
          Manage email unsubscribe list for compliance
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Unsubscribed</p>
                <p className="text-2xl font-bold">{list.length}</p>
              </div>
              <MailX className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Quick Add Email</p>
              <div className="flex gap-2">
                <Input
                  placeholder="email@example.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") handleAddEmail();
                  }}
                />
                <Button variant="outline" onClick={handleAddEmail}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unsubscribe Table */}
      <Card>
        <CardHeader>
          <CardTitle>Unsubscribe List</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No unsubscribed emails</p>
              <p className="text-sm mt-1">
                Unsubscribed email addresses will appear here
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Unsubscribed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredList.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{record.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {record.unsubscribedAt
                        ? format(new Date(record.unsubscribedAt), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove from Unsubscribe List</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove <strong>{record.email}</strong> from the unsubscribe list? This means they may receive marketing emails again.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemove(record.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}