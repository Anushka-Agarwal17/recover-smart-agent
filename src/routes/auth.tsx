import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

const TITLE = "Sign in — RecoverAI Revenue Recovery Console";
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void router.navigate({ to: "/console" });
    });
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("email");
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/console` },
        });
        if (error) throw error;
        toast.success("Account created. Seeding your demo dataset…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await router.navigate({ to: "/console" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setBusy("google");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again or use email.");
      setBusy(null);
      return;
    }
    if (result.redirected) return;
    await router.navigate({ to: "/console" });
  };

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

          <form onSubmit={submit} className="space-y-4">
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
            onClick={() => setIsSignUp((v) => !v)}
            className="mt-5 w-full text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}
