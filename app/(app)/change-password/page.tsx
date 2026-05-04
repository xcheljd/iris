"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Loader2, Check, X } from "lucide-react";
import { changeOwnPassword, setSecretQuestion } from "@/lib/actions";
import { toast } from "sonner";
import { Topbar } from "@/components/topbar";
import { PasswordInput } from "@/components/password-input";

const SECRET_QUESTIONS = [
  "What is your favorite watch brand?",
  "What city were you born in?",
  "What is your pet's name?",
  "What is your mother's maiden name?",
  "What was your first car?",
  "What is your favorite food?",
];

const PW_REQUIREMENTS = [
  { label: "At least 6 characters", test: (pw: string) => pw.length >= 6 },
  { label: "Contains a number", test: (pw: string) => /\d/.test(pw) },
  { label: "Contains uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "Contains lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
];

function PasswordStrength({ password }: { password: string }) {
  const passed = PW_REQUIREMENTS.filter((r) => r.test(password)).length;
  const score = password.length === 0 ? 0 : Math.round((passed / PW_REQUIREMENTS.length) * 100);
  const color = score <= 25 ? "bg-red-500" : score <= 50 ? "bg-orange-500" : score <= 75 ? "bg-yellow-500" : "bg-green-500";
  const label = score <= 25 ? "Weak" : score <= 50 ? "Fair" : score <= 75 ? "Good" : "Strong";

  if (!password) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Strength</span>
        <span className={`text-xs font-medium ${score <= 50 ? "text-orange-500" : "text-green-500"}`}>{label}</span>
      </div>
      <Progress value={score} className={`h-1.5 [&>div]:${color}`} aria-label="Password strength" />
      <ul className="space-y-0.5">
        {PW_REQUIREMENTS.map((r) => (
          <li key={r.label} className="flex items-center gap-1.5 text-xs">
            {r.test(password) ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground/50" />
            )}
            <span className={r.test(password) ? "text-muted-foreground" : "text-muted-foreground/60"}>
              {r.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword && newPassword && newPassword !== confirmPassword;

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
    <>
      <Topbar title="Change Password" />
      <div className="flex-1 p-4 md:p-6 max-w-lg mx-auto">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/settings">Settings</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Change Password</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <PasswordInput
                id="currentPassword"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <PasswordInput
                id="newPassword"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <PasswordStrength password={newPassword} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <PasswordInput
                id="confirmPassword"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                wrapperClassName={passwordsMismatch ? "border-destructive" : passwordsMatch ? "border-green-500" : undefined}
              />
              {passwordsMismatch && <p className="text-xs text-destructive">Passwords do not match</p>}
              {passwordsMatch && <p className="text-xs text-green-500">Passwords match</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Changing..." : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <Card>
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
              {secretLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {secretLoading ? "Saving..." : "Save Question"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </>
  );
}
