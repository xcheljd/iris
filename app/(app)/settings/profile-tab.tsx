"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Pencil } from "lucide-react";
import { updateEmployee } from "@/lib/actions";
import { toast } from "sonner";
import { initials } from "@/lib/utils";
import type { SafeEmployeeRow } from "@/lib/queries";

interface ProfileTabProps {
  currentUser: SafeEmployeeRow | undefined;
  currentUserId: string;
}

export function ProfileTab({ currentUser, currentUserId }: ProfileTabProps) {
  const router = useRouter();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editProfile, setEditProfile] = useState({ firstName: "", lastName: "", username: "" });

  const handleEditProfile = async () => {
    if (!editProfile.firstName.trim() || !editProfile.username.trim()) {
      toast.error("First name and username are required");
      return;
    }
    try {
      const result = await updateEmployee(currentUserId, {
        firstName: editProfile.firstName,
        lastName: editProfile.lastName,
        username: editProfile.username,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated");
      setShowEditDialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to update profile");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>View and manage your account information</CardDescription>
        </CardHeader>
        <CardContent>
          {currentUser ? (
            <div className="flex items-start gap-6">
              <Avatar className="size-16 text-lg">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {initials(currentUser.firstName, currentUser.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <h3 className="text-lg font-semibold">{currentUser.firstName} {currentUser.lastName}</h3>
                <p className="text-sm text-muted-foreground">@{currentUser.username}</p>
                <Badge variant="secondary" className="capitalize">{currentUser.role}</Badge>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setEditProfile({ firstName: currentUser.firstName, lastName: currentUser.lastName ?? "", username: currentUser.username });
                  setShowEditDialog(true);
                }}
              >
                <Pencil className="size-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">Could not load profile information.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your name and username.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="profileFirstName">First Name</FieldLabel>
              <Input id="profileFirstName" value={editProfile.firstName} onChange={(e) => setEditProfile({ ...editProfile, firstName: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="profileLastName">Last Name</FieldLabel>
              <Input id="profileLastName" value={editProfile.lastName} onChange={(e) => setEditProfile({ ...editProfile, lastName: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="profileUsername">Username</FieldLabel>
              <Input id="profileUsername" value={editProfile.username} onChange={(e) => setEditProfile({ ...editProfile, username: e.target.value })} />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button onClick={handleEditProfile} className="w-full">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
