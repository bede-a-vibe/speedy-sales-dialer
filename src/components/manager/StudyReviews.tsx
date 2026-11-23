import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListenButton } from "@/components/calls/ListenButton";
import { useToast } from "@/hooks/use-toast";
import { useSetStudySource, useStudySources, useTeamStudyNotes } from "@/hooks/useCallStudy";
import { useRepProfiles } from "@/hooks/useManager";
import { fmtDay } from "@/lib/loom";

/** Manager → Call study: whose calls each rep reviews, and what they wrote. */
export function StudyReviews() {
  const { toast } = useToast();
  const { data: reps = [] } = useRepProfiles();
  const { data: sources = [] } = useStudySources();
  const { data: notes = [], isLoading, isError } = useTeamStudyNotes();
  const set = useSetStudySource();
  const [rep, setRep] = useState("all");
  const nameOf = (id: string | null) => reps.find((r) => r.user_id === id)?.name ?? "Former rep";
  const has = (s: string, r: string) => sources.some((x) => x.sourceUserId === s && x.repUserId === r);
  const list = notes.filter((n) => rep === "all" || n.userId === rep);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Whose calls each rep reviews</CardTitle>
          <CardDescription>Every recorded call that person makes shows on the rep's Training page: booked calls, and conversations over a minute. From another rep, only the calls that won. New calls join as they happen. The rep can also open the recordings of that person's booked sales meetings.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {reps.map((r) => (
            <div key={r.user_id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="w-32 shrink-0 text-sm font-medium">{r.name}</span>
              {reps.filter((s) => s.user_id !== r.user_id).map((s) => {
                const on = has(s.user_id, r.user_id);
                return (
                  <Button key={s.user_id} type="button" size="sm" className="h-7 text-xs" variant={on ? "default" : "outline"} aria-pressed={on} disabled={set.isPending}
                    onClick={() => set.mutate({ sourceUserId: s.user_id, repUserId: r.user_id, on: !on }, {
                      onError: (e) => toast({ title: "Couldn't save that", description: (e as { message?: string })?.message ?? "Try again.", variant: "destructive" }),
                    })}>
                    {on && <CheckCircle2 className="mr-1 h-3 w-3" />}{s.name}
                  </Button>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">What they wrote</CardTitle>
              <CardDescription>The latest 200 reviews, newest first.</CardDescription>
            </div>
            <Select value={rep} onValueChange={setRep}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filter by rep"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {reps.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
            : isError ? <p className="text-xs text-destructive">Couldn't load the reviews. Refresh to try again.</p>
            : list.length === 0 ? <p className="text-xs text-muted-foreground">Nothing written yet.</p>
            : list.map((n) => (
              <div key={`${n.callLogId}-${n.userId}`} className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{nameOf(n.userId)}</span> on {nameOf(n.callerId)}'s call with <span className="font-medium text-foreground">{n.business ?? "Unknown business"}</span>
                  {n.calledAt ? ` · called ${fmtDay(n.calledAt)}` : ""} · written {fmtDay(n.updatedAt)}
                </p>
                {n.worked && <p className="whitespace-pre-line">{n.worked}</p>}
                {n.useNext && <p className="whitespace-pre-line"><span className="font-medium text-primary">Will use: </span>{n.useNext}</p>}
                {n.dialpadCallId && <ListenButton dialpadCallId={n.dialpadCallId} className="flex flex-wrap items-center gap-2" />}
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
