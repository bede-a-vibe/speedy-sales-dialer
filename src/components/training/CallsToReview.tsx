import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SelfReviewPanel } from "@/components/training/SelfReviewPanel";
import { StudyCalls } from "@/components/training/StudyCalls";
import { useMyStudySources } from "@/hooks/useCallStudy";
import { useRepProfiles } from "@/hooks/useManager";

const firstName = (n: string) => n.split(" ")[0];
const possessive = (n: string) => (n.endsWith("s") ? `${n}'` : `${n}'s`);

/** A rep's own calls, and the calls of anyone a manager has given them to study. ?calls=<user id> opens theirs. */
export function CallsToReview() {
  const [params] = useSearchParams();
  const { data: sources = [] } = useMyStudySources();
  const { data: reps = [] } = useRepProfiles();
  const [picked, setPicked] = useState<string | null>(null);
  const wanted = picked ?? params.get("calls") ?? "mine";
  const view = sources.includes(wanted) ? wanted : "mine";
  const nameOf = (id: string) => firstName(reps.find((r) => r.user_id === id)?.name ?? "Their");

  return (
    <div className="space-y-3">
      {sources.length > 0 && (
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setPicked(v)} className="justify-start" aria-label="Whose calls">
          <ToggleGroupItem value="mine" className="h-9 px-3 text-sm">Your calls</ToggleGroupItem>
          {sources.map((id) => <ToggleGroupItem key={id} value={id} className="h-9 px-3 text-sm">{possessive(nameOf(id))} calls</ToggleGroupItem>)}
        </ToggleGroup>
      )}
      {view === "mine" ? <SelfReviewPanel /> : <StudyCalls key={view} sourceId={view} name={nameOf(view)} />}
    </div>
  );
}
