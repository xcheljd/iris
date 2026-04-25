"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [mode, setMode] = useState<"login" | "forgot-username" | "forgot-question">("login");
  const [forgotUsername, setForgotUsername] = useState("");
  const [secretQuestion, setSecretQuestion] = useState("");
  const [secretAnswer, setSecretAnswer] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { username, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid username or password. Please try again.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  async function onLookupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await fetch("/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "lookup", username: forgotUsername }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setSecretQuestion(data.question);
        setMode("forgot-question");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setForgotLoading(false);
    }
  }

  async function onVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await fetch("/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "verify", username: forgotUsername, answer: secretAnswer, newPassword }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success("Password reset! You can now sign in.");
        setMode("login");
        setForgotUsername("");
        setSecretQuestion("");
        setSecretAnswer("");
        setNewPassword("");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-accent/15 flex items-center justify-center">
            <span className="text-accent text-xl font-serif">C</span>
          </div>
          <CardTitle className="text-2xl font-serif tracking-wide">Iris</CardTitle>
          <CardDescription>Meridian Customer Relationship Management</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "login" && (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Marcus" required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" required />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" variant="gold" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <Button type="button" variant="link" className="block mx-auto" onClick={() => setMode("forgot-username")}>
                Forgot Password?
              </Button>
              <Separator />
              <div className="pt-1 text-xs text-muted-foreground text-center space-y-1">
                <p>Demo accounts:</p>
                <p><span className="font-mono">Marcus / meridian</span> (manager)</p>
                <p><span className="font-mono">Jordan / meridian</span> (associate)</p>
              </div>
            </form>
          )}

          {mode === "forgot-username" && (
            <form onSubmit={onLookupSubmit} className="space-y-4">
              <div className="text-center text-sm text-muted-foreground mb-2">
                Enter your username to begin password recovery.
              </div>
              <div className="space-y-2">
                <Label htmlFor="forgot-username">Username</Label>
                <Input
                  id="forgot-username"
                  value={forgotUsername}
                  onChange={(e) => setForgotUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={forgotLoading}>
                {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {forgotLoading ? "Looking up…" : "Continue"}
              </Button>
              <Button type="button" variant="link" className="block mx-auto" onClick={() => setMode("login")}>
                Back to Sign in
              </Button>
            </form>
          )}

          {mode === "forgot-question" && (
            <form onSubmit={onVerifySubmit} className="space-y-4">
              <div className="text-center text-sm text-muted-foreground mb-2">
                Answer your secret question and set a new password.
              </div>
              <div className="space-y-2">
                <Label>Secret Question</Label>
                <p className="text-sm font-medium">{secretQuestion}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret-answer">Answer</Label>
                <Input
                  id="secret-answer"
                  value={secretAnswer}
                  onChange={(e) => setSecretAnswer(e.target.value)}
                  placeholder="Your answer"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forgot-new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="forgot-new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••"
                    required
                  />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowNewPassword(!showNewPassword)}>
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={forgotLoading}>
                {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {forgotLoading ? "Resetting…" : "Reset Password"}
              </Button>
              <Button type="button" variant="link" className="block mx-auto" onClick={() => setMode("forgot-username")}>
                Back
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
