import { useMemo, useState } from "react";
import { format, startOfMonth, startOfWeek } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange } from "@/hooks/usePipelineItems";
import { getReportMetrics } from "@/lib/reportMetrics";
import { computeFunnel } from "@/lib/funnelMetrics";
import { HeadlineKpiStrip } from "@/components/reports/HeadlineKpiStrip";
import { EndToEndFunnel } from "@/components/funnel/EndToEndFunnel";
import { Button } from "@/components/ui/button";

type Period = "today" | "week" | "month";

export function MyCallFunnel() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("week");
  const now = new Date();
  const to = format(now, "yyyy-MM-dd");
  const from = period === "today" ? to : format(
    period === "week" ? startOfWeek(now, { weekStartsOn: 1 }) : startOfMonth(now),
    "yyyy-MM-dd",
  );
  const { data: callLogs = [], isLoading: callsLoading, isError: callsError } = useCallLogsByDateRange(from, to);
  const { data: bookedItems = [], isLoading: bookingsLoading, isError: bookingsError } = useBookedAppointmentsByDateRange(from, to);

  const metrics = useMemo(() => getReportMetrics({
    callLogs, bookedItems, from, to, repUserId: user?.id,
  }), [callLogs, bookedItems, from, to, user?.id]);
  const funnel = useMemo(() => computeFunnel(
    callLogs.filter((log) => log.user_id === user?.id),
  ), [callLogs, user?.id]);

  return (
    <section className="space-y-4" aria-label="My call funnel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">My call funnel</h2>
          <p className="text-xs text-muted-foreground">Your calls and bookings for the selected period</p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Call funnel period">
          {(["today", "week", "month"] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={period === option ? "default" : "outline"}
              aria-pressed={period === option}
              onClick={() => setPeriod(option)}
            >
              {option === "today" ? "Today" : option === "week" ? "This week" : "This month"}
            </Button>
          ))}
        </div>
      </div>
      {callsError || bookingsError ? (
        <p className="text-sm text-destructive">Could not load your call funnel. Please try again.</p>
      ) : callsLoading || bookingsLoading ? (
        <p className="text-sm text-muted-foreground" role="status">Loading your call funnel…</p>
      ) : (
        <>
          <HeadlineKpiStrip metrics={metrics} />
          <EndToEndFunnel metrics={metrics} funnel={funnel} />
        </>
      )}
    </section>
  );
}