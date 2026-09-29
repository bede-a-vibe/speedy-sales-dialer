import * as React from "react";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";

interface SessionSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callCount: number;
  skippedCount: number;
  sessionOutcomes: Partial<Record<CallOutcome, number>>;
  userId?: string;
  sessionStartedAtMs?: number | null;
}

export function SessionSummaryDialog({
  open,
  onOpenChange,
  callCount,
  skippedCount,
  sessionOutcomes: localOutcomes,
  userId,
  sessionStartedAtMs,
}: SessionSummaryDialogProps) {
  // Bookings made straight in GHL are recovered into call logs by the backend,
  // not clicked in the dialer — so read booked calls since the session started.
  const { data: dbBooked = 0 } = useQuery({
    queryKey: ["session-summary-booked", userId, sessionStartedAtMs],
    enabled: open && !!userId && !!sessionStartedAtMs,
    queryFn: async () => {
      const { count } = await supabase
        .from("call_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("outcome", "booked")
        .gte("created_at", new Date(sessionStartedAtMs! - 60_000).toISOString());
      return count ?? 0;
    },
  });
  const extraBooked = Math.max(0, dbBooked - (localOutcomes.booked || 0));
  const sessionOutcomes: Partial<Record<CallOutcome, number>> = extraBooked
    ? { ...localOutcomes, booked: (localOutcomes.booked || 0) + extraBooked }
    : localOutcomes;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Session Summary
          </DialogTitle>
          <DialogDescription>
            Review this calling session before closing the summary.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-secondary p-3 text-center">
              <p className="font-mono text-2xl font-bold text-foreground">{callCount + extraBooked}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Calls</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary p-3 text-center">
              <p className="font-mono text-2xl font-bold text-foreground">{sessionOutcomes.booked || 0}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Booked</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary p-3 text-center">
              <p className="font-mono text-2xl font-bold text-foreground">{skippedCount}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Skipped</p>
            </div>
          </div>
          <div className="space-y-2">
            {(Object.entries(sessionOutcomes) as [CallOutcome, number][]).map(([outcome, count]) => {
              const config = OUTCOME_CONFIG[outcome];
              return (
                <div key={outcome} className="flex items-center gap-3 text-sm">
                  <div className={`h-2 w-2 rounded-full ${config?.bgClass || "bg-muted"}`} />
                  <span className="flex-1 text-foreground">{config?.label || outcome}</span>
                  <span className="font-mono text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
          <Button onClick={() => onOpenChange(false)} className="w-full">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SessionSummaryDialog;
