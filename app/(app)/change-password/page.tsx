"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { changeOwnPassword, setSecretQuestion } from "@/lib/actions";
import { toast } from "sonner";

const SECRET_QUESTIONS = [
  "What is your favorite watch brand?",
  "What city were you born in?",
  "What is your pet's name?",
  "What is your mother's maiden name?",
  "What was your first car?",
  "What is your favorite food?",
];

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [secretQuestion, setSecretQuestionState] = useState("");
  const [secretAnswer, setSecretAnswer] = useState("");
  const [secretLoading, setSecretLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const result = await changeOwnPassword(currentPassword, newPassword);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  const handleSecretSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretQuestion) {
      toast.error("Please select a question");
      return;
    }
    if (!secretAnswer.trim()) {
      toast.error("Please provide an answer");
      return;
    }
    setSecretLoading(true);
    try {
      const result = await setSecretQuestion(secretQuestion, secretAnswer);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Secret question saved");
      setSecretAnswer("");
    } catch {
      toast.error("Failed to save secret question");
    } finally {
      setSecretLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-lg">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Changing..." : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Secret Recovery Question</CardTitle>
          <CardDescription>Set a secret question to recover your password if you forget it.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSecretSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="secret-question">Question</Label>
              <Select value={secretQuestion} onValueChange={setSecretQuestionState}>
                <SelectTrigger id="secret-question">
                  <SelectValue placeholder="Select a question" />
                </SelectTrigger>
                <SelectContent>
                  {SECRET_QUESTIONS.map((q) => (
                    <SelectItem key={q} value={q}>
                      {q}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret-answer">Answer</Label>
              <Input
                id="secret-answer"
                value={secretAnswer}
                onChange={(e) => setSecretAnswer(e.target.value)}
                placeholder="Your answer"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={secretLoading}>
              {secretLoading ? "Saving..." : "Save Question"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
