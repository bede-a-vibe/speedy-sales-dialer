import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOneOnOnes, useRepProfiles, useSaveOneOnOne } from "@/hooks/useManager";

export function OneOnOnePanel() {
  const { data: reps = [] } = useRepProfiles();
  const [rep, setRep] = useState<string>();
  useEffect(() => { if (!rep && reps.length) setRep(reps[0].user_id); }, [reps, rep]);
  const { data: history = [] } = useOneOnOnes(rep);
  const save = useSaveOneOnOne();
  const { toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [actions, setActions] = useState("");

  const submit = async () => {
    if (!rep) return;
    try {
      await save.mutateAsync({ rep_user_id: rep, meeting_date: date, notes, action_items: actions });
      setNotes(""); setActions("");
      toast({ title: "1:1 saved" });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Log a 1:1</CardTitle>
          <CardDescription>Private to managers — reps don't see these.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Select value={rep} onValueChange={setRep}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Choose rep" /></SelectTrigger>
              <SelectContent>{reps.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
          </div>
          <Textarea placeholder="What you talked about" value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
          <Textarea placeholder="Action items (one per line)" value={actions} onChange={(e) => setActions(e.target.value)} rows={3} />
          <Button className="w-full" disabled={!rep || (!notes && !actions) || save.isPending} onClick={submit}>Save 1:1</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {history.length === 0 ? <p className="text-xs text-muted-foreground">No 1:1s logged for this rep yet.</p>
            : history.map((h) => (
              <div key={h.id} className="rounded-lg border border-border p-3 text-xs">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-primary">
                  {new Date(h.meeting_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                </p>
                {h.notes && <p className="whitespace-pre-wrap">{h.notes}</p>}
                {h.action_items && (
                  <ul className="mt-2 space-y-0.5">
                    {h.action_items.split("\n").filter(Boolean).map((a, i) => (
                      <li key={i} className="flex gap-2 text-muted-foreground"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
