import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const AUTH_REQUEST_TIMEOUT_MS = 15000;

function clearLocalAuthStorage() {
  if (typeof window === "undefined") return;

  const authKeys = Object.keys(window.localStorage).filter(
    (key) => key.startsWith("sb-") && (key.includes("-auth-token") || key.includes("-code-verifier")),
  );

  authKeys.forEach((key) => window.localStorage.removeItem(key));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Check your email for a password reset link!");
          setMode("login");
        }
        return;
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Check your email to confirm your account!");
        }
        return;
      }

      await supabase.auth.signOut({ scope: "local" });
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast.error(error.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <Phone className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">SalesDialer</h1>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
            {mode === "signup" ? "Create Account" : mode === "forgot" ? "Reset Password" : "Sign In"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Back to sign in
            </button>
          )}

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs text-muted-foreground">Display Name</Label>
              <Input
                id="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="bg-card border-border"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="bg-card border-border"
            />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs text-muted-foreground">Password</Label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="bg-card border-border"
              />
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground font-semibold">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "signup" ? "Create Account" : mode === "forgot" ? "Send Reset Link" : "Sign In"}
          </Button>
        </form>

        {mode !== "forgot" && (
          <p className="text-center text-xs text-muted-foreground">
            {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "signup" ? "login" : "signup")}
              className="text-primary hover:underline font-medium"
            >
              {mode === "signup" ? "Sign in" : "Sign up"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
