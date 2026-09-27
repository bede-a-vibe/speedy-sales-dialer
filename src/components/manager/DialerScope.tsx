import { useEffect, useMemo, useState } from "react";
import { Loader2, PhoneForwarded, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useRepProfiles } from "@/hooks/useManager";
import { useDialerFilterOptions } from "@/hooks/useDialerFilterOptions";
import { useAllDialerRestrictions, useSetDialerRestriction } from "@/hooks/useRepDialerRestriction";

/**
 * Per-rep dialling scope. Pick a rep, tick the industries they may call.
 * Enforced in the database on both the claim and the count RPC, so it holds
 * regardless of what filters the rep picks in the dialer.
 */
export function DialerScope() {
  const { toast } = useToast();
  const { data: reps = [] } = useRepProfiles();
  const { data: options } = useDialerFilterOptions();
  const { data: restrictions = [], isLoading } = useAllDialerRestrictions();
  const save = useSetDialerRestriction();

  const [repId, setRepId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const current = useMemo(() => restrictions.find((r) => r.user_id === repId) ?? null, [restrictions, repId]);

  useEffect(() => {
    if (!repId && reps.length > 0) setRepId(reps[0].user_id);
  }, [reps, repId]);

  useEffect(() => {
    setActive(current?.active ?? true);
    setPicked(new Set(current?.allowed_industries ?? []));
  }, [current?.user_id, current?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const industries = options?.industries ?? [];
  const dirty =
    !!repId &&
    (active !== (current?.active ?? true) ||
      [...picked].sort().join("|") !== [...(current?.allowed_industries ?? [])].sort().join("|"));

  async function persist() {
    try {
      await save.mutateAsync({ user_id: repId, allowed_industries: [...picked], active });
      toast({ title: "Scope saved", description: picked.size ? `${reps.find((r) => r.user_id === repId)?.name} can now only dial ${[...picked].join(", ")}.` : "No industries selected — that means no restriction." });
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <PhoneForwarded className="h-4 w-4 text-primary" />
          What each setter can dial
        </CardTitle>
        <CardDescription>
          A new setter starts on one industry. Tick what they may call and the dialer only ever gives them those
          leads — enforced in the database on both the queue and the count, not just hidden in the filters. Leave
          everything unticked for no restriction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={repId} onValueChange={setRepId}>
            <SelectTrigger className="h-9 w-56 text-sm"><SelectValue placeholder="Pick a rep" /></SelectTrigger>
            <SelectContent>
              {reps.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} /> Restriction on
          </label>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((o) => {
            const on = picked.has(o.value);
            return (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <Checkbox
                  checked={on}
                  onCheckedChange={(v) => {
                    const next = new Set(picked);
                    if (v) next.add(o.value); else next.delete(o.value);
                    setPicked(next);
                  }}
                />
                <span className="flex-1">{o.value}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{o.count.toLocaleString()}</span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!dirty || save.isPending} onClick={persist}>
            {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            Save scope
          </Button>
          {current && current.active && current.allowed_industries.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Currently:{" "}
              {current.allowed_industries.map((i) => <Badge key={i} variant="outline" className="mr-1 border-border text-[10px]">{i}</Badge>)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
