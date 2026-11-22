import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FunnelTracker } from "@/components/insights/FunnelTracker";
import { Input } from "@/components/ui/input";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange, useRescheduleSlotsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { todayDateKey } from "@/lib/reportMetrics";
import { trackerDefaultFrom } from "@/lib/funnelTracker";
import { trackerShareTokenFromPath } from "@/lib/trackerShareFetch";

/**
 * /view/tracker/<token>: Insights > Tracker for anyone holding the link, like a
 * view-only Google Sheet. No login, no editing, no setter pay. Data comes
 * through the tracker-share edge function (see lib/trackerShareFetch.ts).
 */
export default function SharedTrackerPage() {
  const { token } = useParams();
  const valid = !!token && trackerShareTokenFromPath(`/view/tracker/${token}`) !== null;

  const linkCheck = useQuery({
    queryKey: ["tracker-share-check", token],
    enabled: valid,
    retry: false,
    queryFn: async () => {
      const { error } = await supabase.from("tracker_targets").select("id").limit(1);
      if (error) throw new Error(error.message);
      return true;
    },
  });

  if (!valid || linkCheck.isError) {
    return (
      <Shell>
        <div className="mx-auto mt-16 max-w-md rounded-md border border-border bg-card p-6 text-center">
          <p className="font-medium">This link doesn't work.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {linkCheck.error instanceof Error ? linkCheck.error.message : "It may have been turned off."} Ask Odin Digital for a new one.
          </p>
        </div>
      </Shell>
    );
  }
  if (!linkCheck.data) {
    return (
      <Shell>
        <p className="mt-16 text-center text-sm text-muted-foreground">Loading the tracker...</p>
      </Shell>
    );
  }
  return (
    <Shell>
      <SharedTrackerBody />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="text-base font-semibold">Odin Digital funnel tracker</h1>
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            <Eye className="h-3 w-3" />
            View only
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-4">{children}</main>
    </div>
  );
}

function SharedTrackerBody() {
  const today = todayDateKey();
  const [dateFrom, setDateFrom] = useState(() => trackerDefaultFrom(today));
  const [dateTo, setDateTo] = useState(today);

  const { data: callLogs = [], isLoading: callsLoading, isError: callsError } = useCallLogsByDateRange(dateFrom, dateTo);
  const { data: bookings = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(dateFrom, dateTo);
  const { data: rescheduleSlots = [] } = useRescheduleSlotsByDateRange(dateFrom, dateTo);
  const { data: reps = [] } = useSalesReps();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>From</span>
          <Input type="date" value={dateFrom} max={dateTo} onChange={(e) => e.target.value && setDateFrom(e.target.value)} className="h-8 w-40" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>To</span>
          <Input type="date" value={dateTo} min={dateFrom} max={today} onChange={(e) => e.target.value && setDateTo(e.target.value)} className="h-8 w-40" />
        </label>
        {callsLoading || bookingsLoading ? (
          <p className="pb-1.5 text-xs text-muted-foreground">Loading calls and bookings. Long ranges take a few seconds; numbers read 0 until they land.</p>
        ) : null}
        {callsError ? <p className="pb-1.5 text-xs text-destructive">Call data didn't load. Refresh the page to try again.</p> : null}
      </div>
      <FunnelTracker
        dateFrom={dateFrom}
        dateTo={dateTo}
        callLogs={callLogs}
        bookings={bookings}
        rescheduleSlots={rescheduleSlots}
        reps={reps}
        readOnly
      />
    </div>
  );
}
