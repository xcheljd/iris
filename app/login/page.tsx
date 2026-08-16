"use client";
import { useState, useRef, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { IrisIcon } from "@/components/iris-icon";
import { PasswordInput } from "@/components/password-input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loginFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!error) return;
    const el = loginFormRef.current;
    if (!el) return;
    el.classList.remove("animate-shake");
    void el.offsetWidth;
    el.classList.add("animate-shake");
  }, [error]);

  const [mode, setMode] = useState<"login" | "forgot-username" | "forgot-question">("login");
  const [forgotUsername, setForgotUsername] = useState("");
  const [secretQuestion, setSecretQuestion] = useState("");
  const [secretAnswer, setSecretAnswer] = useState("");
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
    <main className="relative min-h-screen flex items-center justify-center bg-background p-4">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(50% 40% at 0% 0%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%), radial-gradient(55% 45% at 100% 100%, color-mix(in srgb, var(--foreground) 8%, transparent), transparent 70%)" }} />
      <h1 className="sr-only">Iris Login</h1>
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="gap-2 text-center">
          <IrisIcon size={48} className="mx-auto mb-2" />
          <CardTitle className="text-2xl font-serif tracking-wide">Iris</CardTitle>
          <CardDescription className="italic text-muted-foreground/80 tracking-wide">Every thread, remembered</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "login" && (
            <form ref={loginFormRef} onSubmit={onSubmit}>
              <FieldGroup className="gap-4">
                <Field data-invalid={!!error || undefined}>
                  <FieldLabel htmlFor="username">Username</FieldLabel>
                  <Input id="username" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} placeholder="Enter your username" required autoFocus />
                </Field>
                <Field data-invalid={!!error || undefined}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <PasswordInput id="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="••••••" required />
                  {error && <FieldError>{error}</FieldError>}
                </Field>
                <Button type="submit" variant="gold" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
                <Button type="button" variant="link" className="block mx-auto" onClick={() => setMode("forgot-username")}>
                  Forgot Password?
                </Button>
              </FieldGroup>
            </form>
          )}

          {mode === "forgot-username" && (
            <form onSubmit={onLookupSubmit}>
              <FieldGroup className="gap-4">
                <div className="text-center text-sm text-muted-foreground mb-2">
                  Enter your username to begin password recovery.
                </div>
                <Field>
                  <FieldLabel htmlFor="forgot-username">Username</FieldLabel>
                  <Input
                    id="forgot-username"
                    value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)}
                    placeholder="Enter your username"
                    required
                    autoFocus
                  />
                </Field>
                <Button type="submit" className="w-full" disabled={forgotLoading}>
                  {forgotLoading && <Loader2 className="size-4 animate-spin" />}
                  {forgotLoading ? "Looking up…" : "Continue"}
                </Button>
                <Button type="button" variant="link" className="block mx-auto" onClick={() => setMode("login")}>
                  Back to Sign in
                </Button>
              </FieldGroup>
            </form>
          )}

          {mode === "forgot-question" && (
            <form onSubmit={onVerifySubmit}>
              <FieldGroup className="gap-4">
                <div className="text-center text-sm text-muted-foreground mb-2">
                  Answer your secret question and set a new password.
                </div>
                <Field>
                  <FieldLabel>Secret Question</FieldLabel>
                  <p className="text-sm font-medium">{secretQuestion}</p>
                </Field>
                <Field>
                  <FieldLabel htmlFor="secret-answer">Answer</FieldLabel>
                  <Input
                    id="secret-answer"
                    value={secretAnswer}
                    onChange={(e) => setSecretAnswer(e.target.value)}
                    placeholder="Your answer"
                    required
                    autoFocus
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forgot-new-password">New Password</FieldLabel>
                  <PasswordInput
                    id="forgot-new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••"
                    required
                  />
                </Field>
                <Button type="submit" className="w-full" disabled={forgotLoading}>
                  {forgotLoading && <Loader2 className="size-4 animate-spin" />}
                  {forgotLoading ? "Resetting…" : "Reset Password"}
                </Button>
                <Button type="button" variant="link" className="block mx-auto" onClick={() => setMode("forgot-username")}>
                  Back
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
