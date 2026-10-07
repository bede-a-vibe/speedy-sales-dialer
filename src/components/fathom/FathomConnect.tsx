import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Video, Link2Off, Link2, RefreshCw, Copy } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export async function invokeFathom<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("fathom", { body });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try { msg = (await error.context.json()).error ?? msg; } catch { /* keep */ }
    }
    throw new Error(msg);
  }
  if (data?.result?.error) throw new Error(data.result.error);
  return data as T;
}

/** Closer's own connect card. */
export function FathomConnectCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const { data: info } = useQuery({
    queryKey: ["fathom-connection", "info", user?.id],
    enabled: !!user,
    queryFn: () => invokeFathom<{ has_webhook: boolean; matched: number; webhook_url: string }>({ action: "status" }),
  });
  const { data: conn, isLoading } = useQuery({
    queryKey: ["fathom-connection", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("fathom_connections").select("status, last_synced_at, last_error").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["fathom-connection"] });
  const connect = useMutation({
    mutationFn: () => invokeFathom({ action: "connect", api_key: key, webhook_secret: secret }),
    onSuccess: (d: any) => { setKey(""); setSecret(""); refresh(); toast.success(`Fathom connected — ${d?.result?.fetched ?? 0} meetings pulled, ${d?.result?.matched ?? 0} matched.`); },
    onError: (e: Error) => toast.error(e.message),
  });
  const sync = useMutation({
    mutationFn: () => invokeFathom({ action: "sync" }),
    onSuccess: (d: any) => { refresh(); toast.success(`Synced — ${d?.result?.matched ?? 0} new matches.`); },
    onError: (e: Error) => { refresh(); toast.error(e.message); },
  });
  const saveHook = useMutation({
    mutationFn: () => invokeFathom({ action: "set_webhook", webhook_secret: secret }),
    onSuccess: () => { setSecret(""); refresh(); toast.success("Webhook secret saved."); },
    onError: (e: Error) => toast.error(e.message),
  });
  const copyUrl = () => { if (info?.webhook_url) { navigator.clipboard.writeText(info.webhook_url); toast.success("Webhook URL copied."); } };
  const webhookSteps = info?.webhook_url ? (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
      <p className="font-medium text-foreground">Instant matching (optional)</p>
      <p className="text-muted-foreground">In Fathom, add a webhook with this URL, then paste the webhook secret Fathom gives you below. New meetings match within seconds instead of every 15 minutes.</p>
      <div className="flex gap-2">
        <Input readOnly value={info.webhook_url} className="h-8 bg-background font-mono text-[11px]" />
        <Button size="sm" variant="outline" className="h-8" onClick={copyUrl}><Copy className="h-3.5 w-3.5" /> Copy</Button>
      </div>
    </div>
  ) : null;
  const disconnect = useMutation({
    mutationFn: () => invokeFathom({ action: "disconnect" }),
    onSuccess: () => { refresh(); toast.success("Fathom disconnected."); },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Video className="h-4 w-4" /> Fathom</CardTitle>
        <CardDescription>Connect your own Fathom so your sales meetings are matched to your appointments automatically, with the recording and summary attached.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : conn ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={conn.status === "error" ? "destructive" : "secondary"}>{conn.status === "error" ? "Problem" : "Connected"}</Badge>
              <span className="text-muted-foreground">
                {conn.last_synced_at ? `Last synced ${formatDistanceToNow(new Date(conn.last_synced_at))} ago` : "Not synced yet"} · {info?.matched ?? 0} meetings matched
              </span>
              <Badge variant={info?.has_webhook ? "secondary" : "outline"} className="font-normal">{info?.has_webhook ? "Webhook on" : "Webhook off"}</Badge>
            </div>
            {conn.last_error && <p className="text-xs text-destructive">{conn.last_error}</p>}
            {webhookSteps}
            <div className="flex gap-2">
              <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={info?.has_webhook ? "Replace webhook secret" : "Fathom webhook secret"} className="h-8 bg-background" />
              <Button size="sm" variant="outline" className="h-8" onClick={() => saveHook.mutate()} disabled={!secret.trim() || saveHook.isPending}>Save secret</Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
                {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync now
              </Button>
              <Button size="sm" variant="ghost" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>Disconnect</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">In Fathom, go to <strong>Settings → API Access</strong>, create a key and paste it here. It's stored securely and never shown again.</p>
            <div className="flex gap-2">
              <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Fathom API key" className="bg-background" />
            </div>
            <div className="flex gap-2">
              <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Webhook secret (optional)" className="bg-background" />
              <Button onClick={() => connect.mutate()} disabled={!key.trim() || connect.isPending}>
                {connect.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Connect
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Manager overview: who has Fathom connected. */
export function FathomTeamStatus() {
  const { data } = useQuery({
    queryKey: ["fathom-team"],
    queryFn: async () => {
      const [{ data: roles }, { data: conns }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id"),
        supabase.from("fathom_connections").select("user_id, status, last_synced_at"),
        supabase.from("profiles").select("user_id, display_name, email"),
      ]);
      const ids = new Set((roles ?? []).map((r) => r.user_id));
      return (profiles ?? []).filter((p) => ids.has(p.user_id)).map((p) => ({ ...p, conn: (conns ?? []).find((c) => c.user_id === p.user_id) }));
    },
  });
  if (!data?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-xs">
      <span className="font-medium uppercase tracking-widest text-muted-foreground">Fathom</span>
      {data.map((p) => (
        <Badge key={p.user_id} variant={p.conn ? (p.conn.status === "error" ? "destructive" : "secondary") : "outline"} className="font-normal">
          {p.display_name?.trim() || p.email}: {p.conn ? (p.conn.status === "error" ? "problem" : p.conn.last_synced_at ? `synced ${formatDistanceToNow(new Date(p.conn.last_synced_at))} ago` : "connected") : "not connected"}
        </Badge>
      ))}
    </div>
  );
}

/** Inside an appointment: matched Fathom meeting, or pick one. */
export function FathomMatch({ itemId, closerId, scheduledFor, outcome }: { itemId: string; closerId: string; scheduledFor: string | null; outcome: string | null }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["fathom-match", itemId],
    queryFn: async () => {
      const { data: matched } = await supabase.from("fathom_meetings").select("fathom_id, title, start_at, share_url, summary, match_confidence").eq("pipeline_item_id", itemId).maybeSingle();
      let options: { fathom_id: string; title: string | null; start_at: string | null }[] = [];
      if (!matched && scheduledFor) {
        const t = new Date(scheduledFor).getTime();
        const { data: opts } = await supabase.from("fathom_meetings").select("fathom_id, title, start_at")
          .eq("user_id", closerId).is("pipeline_item_id", null)
          .gte("start_at", new Date(t - 12 * 3600_000).toISOString()).lte("start_at", new Date(t + 12 * 3600_000).toISOString())
          .order("start_at").limit(8);
        options = opts ?? [];
      }
      return { matched, options };
    },
  });
  const act = useMutation({
    mutationFn: (b: Record<string, unknown>) => invokeFathom(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fathom-match", itemId] }); qc.invalidateQueries({ queryKey: ["pipeline-items"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data) return null;
  const due = scheduledFor && new Date(scheduledFor).getTime() < Date.now();
  const m = data.matched;
  if (m) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Matched by Fathom</Badge>
          <span className="text-muted-foreground">{m.title} · {m.start_at ? format(new Date(m.start_at), "d MMM h:mma") : ""}</span>
          {m.share_url && <a href={m.share_url} target="_blank" rel="noreferrer" className="text-primary underline">Watch recording</a>}
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => act.mutate({ action: "unlink", fathom_id: m.fathom_id })}><Link2Off className="h-3.5 w-3.5" /> Wrong meeting</Button>
        </div>
        {!outcome && <p className="text-xs font-medium text-primary">Fathom says this meeting happened — log the result.</p>}
        {m.summary && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Fathom summary</summary><div className="mt-2 whitespace-pre-wrap">{m.summary}</div></details>}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3 text-xs">
      {due && <p className="font-medium text-destructive">No Fathom recording — possible no-show.</p>}
      {data.options.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground">Fathom meetings that day — pick the right one:</p>
          {data.options.map((o) => (
            <Button key={o.fathom_id} size="sm" variant="outline" className="mr-2 h-7" onClick={() => act.mutate({ action: "link", fathom_id: o.fathom_id, pipeline_item_id: itemId })}>
              <Link2 className="h-3.5 w-3.5" /> {o.title ?? "Untitled"} · {o.start_at ? format(new Date(o.start_at), "h:mma") : ""}
            </Button>
          ))}
        </div>
      )}
      {!due && data.options.length === 0 && <p className="text-muted-foreground">Fathom recording will attach automatically after the meeting.</p>}
    </div>
  );
}
