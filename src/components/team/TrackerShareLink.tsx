import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminAccess } from "@/hooks/useUserRole";

// tracker_share_links is newer than the generated types.
const db = supabase as unknown as SupabaseClient;

interface ShareLinkRow {
  id: string;
  token: string;
  created_at: string;
  last_viewed_at: string | null;
  view_count: number;
}

function trackerShareUrl(token: string, origin = window.location.origin) {
  return `${origin}/view/tracker/${token}`;
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Team & settings: the view-only link to Insights > Tracker. One live link at
 * a time. Anyone holding it sees the tracker (no login, no editing, no setter
 * pay). New link turns the old one off; Turn off kills it. Admins only.
 */
export function TrackerShareLink() {
  const { isAdmin } = useAdminAccess();
  const queryClient = useQueryClient();

  const { data: link, isLoading } = useQuery({
    queryKey: ["tracker-share-link"],
    enabled: isAdmin,
    queryFn: async (): Promise<ShareLinkRow | null> => {
      const { data, error } = await db
        .from("tracker_share_links")
        .select("id, token, created_at, last_viewed_at, view_count")
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as ShareLinkRow | undefined) ?? null;
    },
  });

  const revokeAll = async () => {
    const { error } = await db.from("tracker_share_links").update({ revoked_at: new Date().toISOString() }).is("revoked_at", null);
    if (error) throw error;
  };

  const create = useMutation({
    mutationFn: async () => {
      await revokeAll();
      const { data, error } = await db.from("tracker_share_links").insert({}).select("token").single();
      if (error) throw error;
      return (data as { token: string }).token;
    },
    onSuccess: async (token) => {
      await queryClient.invalidateQueries({ queryKey: ["tracker-share-link"] });
      try {
        await navigator.clipboard.writeText(trackerShareUrl(token));
        toast.success("New link copied. The old one no longer works.");
      } catch {
        toast.success("New link made. The old one no longer works.");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't make the link"),
  });

  const turnOff = useMutation({
    mutationFn: revokeAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracker-share-link"] });
      toast.success("Link turned off.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't turn the link off"),
  });

  if (!isAdmin) return null;

  const url = link ? trackerShareUrl(link.token) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it.");
    }
  };

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Link to tracking sheet</h2>
        <span className="text-xs text-muted-foreground">View only, like a shared Google Sheet</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Anyone with the link sees Insights &gt; Tracker without logging in. They can't change anything and they don't see setter pay.
      </p>
      {isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading...</p>
      ) : link ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-8 min-w-[260px] flex-1 font-mono text-xs" aria-label="Tracker link" />
            <Button size="sm" className="h-8" onClick={copy}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy link
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => create.mutate()} disabled={create.isPending}>
              New link
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => turnOff.mutate()} disabled={turnOff.isPending}>
              Turn off
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Made {fmtWhen(link.created_at)}.{" "}
            {link.last_viewed_at ? `Opened ${link.view_count} time${link.view_count === 1 ? "" : "s"}, last ${fmtWhen(link.last_viewed_at)}.` : "Not opened yet."}{" "}
            New link turns this one off.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <Button size="sm" className="h-8" onClick={() => create.mutate()} disabled={create.isPending}>
            Create link
          </Button>
        </div>
      )}
    </section>
  );
}
