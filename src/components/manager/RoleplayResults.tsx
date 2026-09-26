import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRepProfiles, useRoleplayRounds } from "@/hooks/useManager";

export function RoleplayResults() {
  const { data: rounds = [], isLoading } = useRoleplayRounds();
  const { data: reps = [] } = useRepProfiles();
  const nameOf = (id: string) => reps.find((r) => r.user_id === id)?.name ?? "Unknown";

  const byRep = new Map<string, any[]>();
  for (const r of rounds) (byRep.get(r.user_id) ?? byRep.set(r.user_id, []).get(r.user_id)!).push(r);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Roleplay results</CardTitle>
        <CardDescription>Last 30 days of practice rounds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
          : byRep.size === 0 ? <p className="text-xs text-muted-foreground">No one has run a roleplay in the last 30 days.</p>
          : [...byRep.entries()].map(([uid, list]) => {
            const passed = list.filter((r) => r.passed).length;
            return (
              <div key={uid} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium">{nameOf(uid)}</span>
                  <span className="font-mono text-muted-foreground">{list.length} rounds · {passed} passed ({Math.round((100 * passed) / list.length)}%)</span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {list.slice(0, 8).map((r, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="py-1 pr-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
                        <td className="py-1 pr-3">{r.mode}{r.persona ? ` · ${r.persona}` : ""}</td>
                        <td className="py-1 pr-3 font-mono">L{r.level}</td>
                        <td className="py-1">
                          {r.passed ? <span className="font-semibold text-[hsl(var(--outcome-booked))]">Passed</span>
                            : r.passed === false ? <span className="text-destructive">Failed{r.failed_milestone ? ` at ${r.failed_milestone.replace(/_/g, " ")}` : ""}</span>
                            : <span className="text-muted-foreground">Unfinished</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
