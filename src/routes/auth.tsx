import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Loader2, Mail, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const TITLE = "Sign in ΓÇö RecoverAI Revenue Recovery Console";
const DESCRIPTION =
  "Sign in to the RecoverAI console to review revenue at risk, AI recovery decisions and simulated intervention outcomes.";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) =>
    z.object({ mode: z.enum(["signin", "signup"]).optional() }).parse(search),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  // shown after signup when email confirmation is required
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  // inline error banner (not toast) for persistent messages
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    // Handle OAuth callback: Supabase appends #access_token=... to the redirect URI.
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          void router.navigate({ to: "/console" });
        }
      });
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void router.navigate({ to: "/console" });
    });
  }, [router]);

  const clearError = () => setInlineError(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();
    setBusy("email");
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;

        // If session is returned immediately, email confirmation is disabled ΓÇö go straight in.
        if (data.session) {
          await router.navigate({ to: "/console" });
          return;
        }

        // No session means confirmation email was sent.
        setAwaitingConfirm(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const msg = error.message ?? "";
          if (
            msg.toLowerCase().includes("invalid") ||
            msg.toLowerCase().includes("credentials") ||
            msg.toLowerCase().includes("not found")
          ) {
            setInlineError(
              "Incorrect email or password. If you just created an account, you need to confirm your email first ΓÇö check your inbox for a confirmation link.",
            );
          } else if (msg.toLowerCase().includes("confirm")) {
            setInlineError(
              "Email not confirmed yet. Check your inbox and click the confirmation link, then try signing in again.",
            );
          } else {
            setInlineError(msg || "Authentication failed. Please try again.");
          }
          return;
        }
        await router.navigate({ to: "/console" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    clearError();
    setBusy("google");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) {
        const msg = error.message ?? "";
        if (msg.includes("OAuth secret") || msg.includes("provider") || error.status === 400) {
          setInlineError(
            "Google sign-in is not configured yet. Go to your Supabase dashboard ΓåÆ Authentication ΓåÆ Providers ΓåÆ Google and add your Google Client ID and Secret.",
          );
        } else {
          setInlineError("Google sign-in failed: " + msg);
        }
        setBusy(null);
      }
      // On success the browser is redirected to Google ΓÇö nothing more to do.
    } catch {
      toast.error("Google sign-in failed. Please try again or use email.");
      setBusy(null);
    }
  };

  // ΓöÇΓöÇ "Check your email" screen ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  if (awaitingConfirm) {
    return (
      <div className="grid-glow flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Link to="/" className="mx-auto flex w-fit" aria-label="RecoverAI home">
            <Logo />
          </Link>
          <div className="panel mt-6 p-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="size-6 text-primary" aria-hidden />
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
              Click it to activate your account, then come back here to sign in.
            </p>
            <Button
              variant="outline"
              className="mt-6 w-full"
              onClick={() => {
                setAwaitingConfirm(false);
                setIsSignUp(false);
              }}
            >
              Back to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ΓöÇΓöÇ Main auth form ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  return (
    <div className="grid-glow flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mx-auto flex w-fit" aria-label="RecoverAI home">
          <Logo />
        </Link>

        <div className="panel mt-6 p-6">
          <h1 className="text-xl font-semibold tracking-tight">
            {isSignUp ? "Create your recovery console" : "Sign in to RecoverAI"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isSignUp
              ? "A reproducible synthetic dataset is generated for your account on first load."
              : "Continue to your revenue-at-risk dashboard."}
          </p>

          {/* Inline error banner */}
          {inlineError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{inlineError}</span>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full"
            onClick={google}
            disabled={busy !== null}
          >
            {busy === "google" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[0.7rem] text-muted-foreground">or use email</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-4" onChange={clearError}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@merchant.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy !== null}>
              {busy === "email" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {isSignUp ? "Create account" : "Sign in"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => { setIsSignUp((v) => !v); clearError(); }}
            className="mt-5 w-full text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}
