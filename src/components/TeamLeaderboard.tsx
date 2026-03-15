import { useCallLogs } from "@/hooks/useCallLogs";
import { Trophy } from "lucide-react";

interface RepStats {
  userId: string;
  name: string;
  calls: number;
  booked: number;
  conversionPct: number;
}

export function TeamLeaderboard() {
  const { data: callLogs = [] } = useCallLogs();

  // Group by user
  const repMap = new Map<string, { calls: number; booked: number; name: string }>();
  for (const log of callLogs as any[]) {
    const uid = log.user_id;
    const existing = repMap.get(uid) || { calls: 0, booked: 0, name: "Unknown" };
    existing.calls++;
    if (log.outcome === "booked") existing.booked++;
    // Try to get name from the profiles join if available
    if (log.profiles?.display_name) existing.name = log.profiles.display_name;
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

  if (reps.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Team Leaderboard</h3>
      </div>
      <div className="space-y-2">
        {reps.slice(0, 5).map((rep, i) => (
          <div key={rep.userId} className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/50 border border-border">
            <span className={`text-sm font-bold font-mono w-6 text-center ${
              i === 0 ? "text-primary" : "text-muted-foreground"
            }`}>
              {i + 1}
            </span>
            <span className="text-sm font-medium text-foreground flex-1">{rep.name}</span>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="font-mono">{rep.calls} calls</span>
              <span className="font-mono font-semibold text-foreground">{rep.booked} booked</span>
              <span className="font-mono">{rep.conversionPct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
