import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";
import { Activity } from "lucide-react";

interface RealtimeLog {
  id: string;
  outcome: string;
  created_at: string;
  contact_id: string;
  user_id: string;
  contactName?: string;
  userName?: string;
}

export function LiveActivityFeed() {
  const [items, setItems] = useState<RealtimeLog[]>([]);

  useEffect(() => {
    // Fetch recent logs on mount
    const fetchRecent = async () => {
      const { data } = await supabase
        .from("call_logs")
        .select("id, outcome, created_at, contact_id, user_id, contacts(business_name), profiles:user_id(display_name)")
        .order("created_at", { ascending: false })
        .limit(8);

      if (data) {
        setItems(
          data.map((d: any) => ({
            id: d.id,
            outcome: d.outcome,
            created_at: d.created_at,
            contact_id: d.contact_id,
            user_id: d.user_id,
            contactName: d.contacts?.business_name || "Unknown",
            userName: d.profiles?.display_name || "Rep",
          }))
        );
      }
    };
    fetchRecent();

    // Subscribe to realtime
    const channel = supabase
      .channel("live-calls")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_logs" },
        async (payload) => {
          const log = payload.new as any;
          // Fetch contact name
          const { data: contact } = await supabase
            .from("contacts")
            .select("business_name")
            .eq("id", log.contact_id)
            .single();

          const newItem: RealtimeLog = {
            id: log.id,
            outcome: log.outcome,
            created_at: log.created_at,
            contact_id: log.contact_id,
            user_id: log.user_id,
            contactName: contact?.business_name || "Unknown",
            userName: "Rep",
          };

          setItems((prev) => [newItem, ...prev].slice(0, 8));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Live Activity</h3>
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">No activity yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative">
          <Activity className="h-4 w-4 text-primary" />
          <span className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full animate-pulse" />
        </div>
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Live Activity</h3>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const config = OUTCOME_CONFIG[item.outcome as CallOutcome];
          const ago = getTimeAgo(item.created_at);
          return (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/50 border border-border">
              <div className={`w-2 h-2 rounded-full shrink-0 ${config?.bgClass || "bg-muted-foreground"}`} />
              <span className="text-sm text-foreground flex-1 truncate">{item.contactName}</span>
              <span className="text-xs text-muted-foreground shrink-0">{config?.label || item.outcome}</span>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">{ago}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
