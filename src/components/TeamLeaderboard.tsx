import { forwardRef, useEffect, useState } from "react";
import { useCallLogs } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Crown, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

interface RepStats {
  userId: string;
  name: string;
  calls: number;
  booked: number;
  conversionPct: number;
}

const MEDAL_COLORS = [
  "text-[hsl(var(--outcome-voicemail))]", // gold
  "text-muted-foreground",                // silver
  "text-[hsl(var(--outcome-voicemail))]",  // bronze (amber-ish)
];

export const TeamLeaderboard = forwardRef<HTMLDivElement>(function TeamLeaderboard(_, ref) {
  const { user } = useAuth();
  const { data: callLogs = [], isLoading } = useCallLogs();
  const [profileNames, setProfileNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const fetchNames = async () => {
      const userIds = [...new Set((callLogs as any[]).map((l) => l.user_id))];
      if (userIds.length === 0) return;
      const { data } = await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds);
      if (data) setProfileNames(new Map(data.map((p) => [p.user_id, p.display_name || "Unknown"])));
    };
    fetchNames();
  }, [callLogs]);

  const repMap = new Map<string, { calls: number; booked: number; name: string }>();
  for (const log of callLogs as any[]) {
    const uid = log.user_id;
    const existing = repMap.get(uid) || { calls: 0, booked: 0, name: profileNames.get(uid) || "Unknown" };
    existing.calls++;
    if (log.outcome === "booked") existing.booked++;
    if (profileNames.has(uid)) existing.name = profileNames.get(uid)!;
    repMap.set(uid, existing);
  }

  const reps: RepStats[] = Array.from(repMap.entries())
    .map(([userId, stats]) => ({
      userId,
      name: stats.name,
      calls: stats.calls,
      booked: stats.booked,
      conversionPct: stats.calls > 0 ? Math.round((stats.booked / stats.calls) * 100) : 0,
    }))
    .sort((a, b) => b.booked - a.booked || b.calls - a.calls);

  if (isLoading) {
    return (
      <div ref={ref} className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Team Leaderboard</h3>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/40 border border-border">
              <Skeleton className="h-5 w-6 rounded" />
              <Skeleton className="h-4 flex-1" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-8" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (reps.length === 0) {
    return (
      <div ref={ref} className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Team Leaderboard</h3>
        </div>
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No team activity yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Completed calls will populate rankings automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Team Leaderboard</h3>
      </div>
      <div className="space-y-2">
        {reps.slice(0, 5).map((rep, i) => {
          const isMe = rep.userId === user?.id;
          return (
            <div
              key={rep.userId}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md border transition-all",
                isMe
                  ? "bg-primary/5 border-primary/30 shadow-[0_0_12px_-4px_hsl(var(--primary)/0.25)]"
                  : "bg-muted/50 border-border"
              )}
            >
              <span className="w-6 flex items-center justify-center">
                {i === 0 ? (
                  <Crown className={cn("h-4.5 w-4.5", MEDAL_COLORS[0])} />
                ) : i < 3 ? (
                  <Medal className={cn("h-4 w-4", MEDAL_COLORS[i])} />
                ) : (
                  <span className="text-sm font-bold font-mono text-muted-foreground">{i + 1}</span>
                )}
              </span>
              <span className={cn("text-sm font-medium flex-1", isMe ? "text-primary font-semibold" : "text-foreground")}>
                {rep.name} {isMe && <span className="text-[10px] text-primary ml-1">(you)</span>}
              </span>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="font-mono">{rep.calls} calls</span>
                <span className="font-mono font-semibold text-foreground">{rep.booked} booked</span>
                <span className="font-mono">{rep.conversionPct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
