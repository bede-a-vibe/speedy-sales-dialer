import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  AUTH_REQUEST_TIMEOUT_MS,
  createPrimaryStorageAuthClient,
  resetLocalAuthState,
  withTimeout,
} from "@/lib/auth";

function readRecoveryParams() {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);

  return {
    code: url.searchParams.get("code"),
    type: url.searchParams.get("type") ?? hashParams.get("type"),
    tokenHash: url.searchParams.get("token_hash") ?? hashParams.get("token_hash"),
    accessToken: hashParams.get("access_token"),
    refreshToken: hashParams.get("refresh_token"),
    errorCode: url.searchParams.get("error_code") ?? hashParams.get("error_code"),
    errorDescription:
      url.searchParams.get("error_description") ?? hashParams.get("error_description"),
  };
}

function clearRecoveryParamsFromUrl() {
  const url = new URL(window.location.href);
  window.history.replaceState({}, document.title, url.pathname);
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);
  const recoveryClient = useMemo(
    () => createPrimaryStorageAuthClient({ detectSessionInUrl: true }),
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const initializeRecoverySession = async () => {
      await resetLocalAuthState();

      const {
        code,
        type,
        tokenHash,
        accessToken,
        refreshToken,
        errorCode,
        errorDescription,
      } = readRecoveryParams();

      if (errorCode) {
        throw new Error(
          decodeURIComponent(
            errorDescription ?? "Password reset link is invalid or expired. Please request a new one.",
          ),
        );
      }

      if (code) {
        const { error } = await withTimeout(
          recoveryClient.auth.exchangeCodeForSession(code),
          AUTH_REQUEST_TIMEOUT_MS,
          "Password reset session timed out. Please reopen the link from your email.",
        );

        if (error) throw error;
        clearRecoveryParamsFromUrl();
      } else if (accessToken && refreshToken) {
        const { error } = await withTimeout(
          recoveryClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          }),
          AUTH_REQUEST_TIMEOUT_MS,
          "Password reset session timed out. Please reopen the link from your email.",
        );

        if (error) throw error;
        clearRecoveryParamsFromUrl();
      } else if (type === "recovery" && tokenHash) {
        const { error } = await withTimeout(
          recoveryClient.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          }),
          AUTH_REQUEST_TIMEOUT_MS,
          "Password reset session timed out. Please reopen the link from your email.",
        );

        if (error) throw error;
        clearRecoveryParamsFromUrl();
      }

      const { data, error } = await withTimeout(
        recoveryClient.auth.getSession(),
        AUTH_REQUEST_TIMEOUT_MS,
        "Password reset session timed out. Please reopen the link from your email.",
      );

      if (error) throw error;
      if (!data.session) {
        throw new Error("Password reset link is invalid or expired. Please request a new one.");
      }

      if (isMounted) {
        setReady(true);
      }
    };

    void initializeRecoverySession().catch((error) => {
      if (!isMounted) return;
      toast.error(error instanceof Error ? error.message : "Unable to verify reset link.");
    });

    return () => {
      isMounted = false;
    };
  }, [recoveryClient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (!ready) {
      toast.error("Your reset link is still loading. Please wait a moment and try again.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await withTimeout(
        recoveryClient.auth.updateUser({ password }),
        AUTH_REQUEST_TIMEOUT_MS,
        "Updating password timed out. Please try again.",
      );

      if (error) {
        toast.error(error.message);
      } else {
        setSuccess(true);
        toast.success("Password updated successfully!");
        window.setTimeout(() => {
          window.location.assign("/");
        }, 1200);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update password.");
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
            Set New Password
          </p>
        </div>

        {success ? (
          <div className="text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <p className="text-sm text-foreground font-medium">Password updated!</p>
            <p className="text-xs text-muted-foreground">Redirecting to dashboard...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!ready && (
              <p className="text-xs text-muted-foreground">Checking your reset link...</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs text-muted-foreground">New Password</Label>
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
            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-xs text-muted-foreground">Confirm Password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="bg-card border-border"
              />
            </div>
            <Button type="submit" disabled={loading || !ready} className="w-full bg-primary text-primary-foreground font-semibold">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
