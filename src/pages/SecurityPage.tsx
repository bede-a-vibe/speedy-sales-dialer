import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Laptop, MonitorSmartphone, RefreshCw, Smartphone, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getStaySignedIn, setStaySignedIn, shortSessionMinutesLeft } from "@/lib/sessionPersistence";

interface SessionRow {
  session_id: string;
  created_at: string | null;
  updated_at: string | null;
  refreshed_at: string | null;
  not_after: string | null;
  user_agent: string | null;
  ip: string | null;
}

function describeDevice(ua: string | null) {
  if (!ua) return { label: "Unknown device", mobile: false };
  const mobile = /iphone|ipad|android|mobile/i.test(ua);
  const os = /iphone|ipad/i.test(ua)
    ? "iOS"
    : /android/i.test(ua)
      ? "Android"
      : /mac os x/i.test(ua)
        ? "macOS"
        : /windows/i.test(ua)
          ? "Windows"
          : /linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /chrome\//i.test(ua) && !/chromium/i.test(ua)
      ? "Chrome"
      : /safari\//i.test(ua) && !/chrome/i.test(ua)
        ? "Safari"
        : /firefox\//i.test(ua)
          ? "Firefox"
          : "Browser";
  return { label: `${browser} on ${os}`, mobile };
}

function formatWhen(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.endsWith("Z") || value.includes("+") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default function SecurityPage() {
  const { session, signOut } = useAuth();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [stay, setStay] = useState(() => getStaySignedIn());
  const [minutesLeft, setMinutesLeft] = useState<number | null>(() => shortSessionMinutesLeft());

  useEffect(() => {
    const timer = window.setInterval(() => setMinutesLeft(shortSessionMinutesLeft()), 30_000);
    return () => window.clearInterval(timer);
  }, [stay]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: SessionRow[] | null; error: { message: string } | null }>)("list_my_sessions");
    if (error) {
      toast.error("Couldn't load your sign-ins. Please try again.");
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  let currentSessionId: string | null = null;
  try {
    const token = session?.access_token;
    if (token) {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      currentSessionId = typeof payload?.session_id === "string" ? payload.session_id : null;
    }
  } catch {
    currentSessionId = null;
  }

  return (
    <AppLayout title="Security">
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">Where you're signed in</CardTitle>
              <CardDescription>
                Every device with an active sign-in to your account. If you don't recognise one, sign out everywhere and
                change your password.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Loading your sign-ins…</p>}

            {!loading && rows.length === 0 && (
              <p className="text-sm text-muted-foreground">No active sign-ins found.</p>
            )}

            {!loading &&
              rows.map((row) => {
                const device = describeDevice(row.user_agent);
                const isCurrent = currentSessionId === row.session_id;
                return (
                  <div
                    key={row.session_id}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      {device.mobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{device.label}</p>
                        {isCurrent && (
                          <Badge variant="secondary" className="text-[10px]">
                            This device
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last active {formatWhen(row.refreshed_at ?? row.updated_at)} · First signed in{" "}
                        {formatWhen(row.created_at)}
                      </p>
                      {row.ip && (
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">IP {row.ip}</p>
                      )}
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign out everywhere</CardTitle>
            <CardDescription>
              Ends every sign-in on every device, including this one. Use this if a device was lost, stolen or shared.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button
              variant="destructive"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await signOut("global");
                  toast.success("Signed out of all devices.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to sign out everywhere.");
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              <MonitorSmartphone className="mr-2 h-4 w-4" />
              {signingOut ? "Signing out…" : "Sign out of all devices"}
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              You'll need to sign in again afterwards.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
