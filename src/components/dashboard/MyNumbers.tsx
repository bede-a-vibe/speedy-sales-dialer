import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SetterTracker } from "@/components/insights/SetterTracker";
import { ClosingTracker } from "@/components/insights/ClosingTracker";
import { useAuth } from "@/hooks/useAuth";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange, useRescheduleSlotsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { addDayKeys, dayKeyOf, lastDayOfMonth, monthOf } from "@/lib/funnelTracker";

type Range = "this_month" | "last_month" | "last_90";

function rangeDates(range: Range, today: string): { from: string; to: string } {
  const thisMonth = monthOf(today);
  if (range === "last_month") {
    const prev = monthOf(addDayKeys(thisMonth, -1));
    return { from: prev, to: lastDayOfMonth(prev) };
  }
  if (range === "last_90") return { from: addDayKeys(today, -89), to: today };
  return { from: thisMonth, to: today };
}

/**
 * The signed-in person's own numbers, the same views as Insights > Setters and
 * Closing but locked to them. The Tracker's funnel and P&L stay admin-only.
 */
export function MyNumbers({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("this_month");
  const [view, setView] = useState("setting");
  const today = dayKeyOf(new Date().toISOString());
  const { from, to } = useMemo(() => rangeDates(range, today), [range, today]);

  const { data: callLogs = [], isLoading } = useCallLogsByDateRange(from, to);
  const { data: bookings = [] } = useBookedAppointmentsByDateRange(from, to);
  const { data: rescheduleSlots = [] } = useRescheduleSlotsByDateRange(from, to);
  const { data: reps = [] } = useSalesReps();

  if (!user) return null;
  return (
    <div className={embedded ? "" : "rounded-xl border border-border bg-card p-5"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {embedded ? (
          <span />
        ) : (
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">My numbers</h3>
            <p className="mt-1 text-sm text-muted-foreground">Your setting and closing, day by day, the same way the team reports are worked out.</p>
          </div>
        )}
        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This month</SelectItem>
            <SelectItem value="last_month">Last month</SelectItem>
            <SelectItem value="last_90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading ? <p className="mb-2 text-xs text-muted-foreground">Loading your calls...</p> : null}
      <Tabs value={view} onValueChange={setView}>
        <TabsList className="mb-3">
          <TabsTrigger value="setting">Setting</TabsTrigger>
          <TabsTrigger value="closing">Closing</TabsTrigger>
        </TabsList>
        <TabsContent value="setting">
          <SetterTracker
            dateFrom={from}
            dateTo={to}
            callLogs={callLogs}
            bookings={bookings}
            rescheduleSlots={rescheduleSlots}
            reps={reps}
            activeRepId={user.id}
          />
        </TabsContent>
        <TabsContent value="closing">
          <ClosingTracker
            dateFrom={from}
            dateTo={to}
            bookings={bookings}
            rescheduleSlots={rescheduleSlots}
            activeRepId={user.id}
            selectedRepLabel="You"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
