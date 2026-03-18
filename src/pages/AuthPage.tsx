import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  AUTH_REQUEST_TIMEOUT_MS,
  createPrimaryStorageAuthClient,
  createTransientAuthClient,
  resetLocalAuthState,
  withTimeout,
} from "@/lib/auth";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  // Clear any stale auth tokens on mount so previous failed attempts don't cause lock contention
  useState(() => {
    resetLocalAuthState().catch(() => {});
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const normalizedEmail = email.trim();

    try {
      if (mode === "forgot") {
        await resetLocalAuthState();

        const authClient = createTransientAuthClient();
        const { error } = await withTimeout(
          authClient.auth.resetPasswordForEmail(normalizedEmail, {
            redirectTo: `${window.location.origin}/reset-password`,
          }),
          AUTH_REQUEST_TIMEOUT_MS,
          "Password reset request timed out. Please try again.",
        );

        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Check your email for a password reset link!");
          setMode("login");
        }
        return;
      }

      if (mode === "signup") {
        await resetLocalAuthState();

        const authClient = createTransientAuthClient();
        const { error } = await withTimeout(
          authClient.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: { display_name: displayName },
              emailRedirectTo: window.location.origin,
            },
          }),
          AUTH_REQUEST_TIMEOUT_MS,
          "Sign up timed out. Please try again.",
        );

        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Check your email to confirm your account!");
        }
        return;
      }

      await resetLocalAuthState();

      const authClient = createPrimaryStorageAuthClient();
      const { error } = await withTimeout(
        authClient.auth.signInWithPassword({ email: normalizedEmail, password }),
        AUTH_REQUEST_TIMEOUT_MS,
        "Login timed out. Please try again.",
      );

      if (error) {
        toast.error(error.message);
        return;
      }

      window.location.assign("/");
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
