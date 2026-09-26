import { Star, MessageSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useMyReviews } from "@/hooks/useManager";

/** A rep's own manager call reviews. Renders nothing until they have one. */
export function MyCallReviews() {
  const { user } = useAuth();
  const { data: reviews = [] } = useMyReviews(user?.id);
  if (reviews.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-5 w-5 text-primary" /> Feedback from your manager
        </CardTitle>
        <CardDescription>Calls your manager has listened to and scored.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {reviews.slice(0, 6).map((r: any) => (
          <div key={r.id} className="rounded-lg border border-border p-3 text-xs">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-medium">{r.call_logs?.contacts?.business_name ?? "Call"}</span>
              <span className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={n <= r.score ? "h-3.5 w-3.5 fill-primary text-primary" : "h-3.5 w-3.5 text-muted-foreground/30"} />
                ))}
              </span>
            </div>
            {r.went_well && <p><span className="font-medium text-[hsl(var(--outcome-booked))]">Went well: </span>{r.went_well}</p>}
            {r.improve && <p className="mt-1"><span className="font-medium text-primary">Fix next call: </span>{r.improve}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
