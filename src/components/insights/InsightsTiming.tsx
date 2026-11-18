import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ReportSection } from "@/components/reports/ReportSection";
import { HourlyBreakdownTable } from "@/components/reports/HourlyBreakdownTable";
import { BookingHeatMap } from "@/components/reports/BookingHeatMap";
import { PickupHeatMap } from "@/components/reports/PickupHeatMap";
import { RateHeatMap } from "@/components/reports/RateHeatMap";
import { TalkTimePanel } from "@/components/insights/TalkTimePanel";
import { OpenerSurvivalCard } from "@/components/insights/OpenerSurvivalCard";
import { DialClockCard } from "@/components/insights/DialClockCard";
import { PickupRateTrendCard } from "@/components/insights/PickupRateTrendCard";
import {
  getHourlyMetrics,
  getBookingHeatMapData,
  getPickupHeatMapData,
  getShowUpHeatMapData,
  getCloseRateHeatMapData,
  todayLocalDateKey,
} from "@/lib/hourlyMetrics";
import type { BookedAppointmentReportItem } from "@/hooks/usePipelineItems";

interface Props {
  dateFrom: string;
  dateTo: string;
  callLogs: any[];
  bookings: any[];
  /** Missed slots of moved meetings (useRescheduleSlotsByDateRange). Show-up heat map only. */
  rescheduleSlots?: BookedAppointmentReportItem[];
  activeRepId?: string;
  selectedRepLabel?: string;
}

const NO_SLOTS: BookedAppointmentReportItem[] = [];

/**
 * Insights → Setters → Timing, in four groups: when to dial, number health,
 * conversations, and meetings by time slot; then a one-day hourly drilldown.
 */
export function InsightsTiming({ dateFrom, dateTo, callLogs, bookings, rescheduleSlots = NO_SLOTS, activeRepId, selectedRepLabel }: Props) {
  // Local date: toISOString() is the UTC date, so before 10 or 11am Melbourne
  // the breakdown opened on yesterday and hid this morning's dials.
  const [hourlyDate, setHourlyDate] = useState(() => todayLocalDateKey());

  const hourlyRows = useMemo(
    () => getHourlyMetrics(callLogs, bookings, hourlyDate, activeRepId),
    [callLogs, bookings, hourlyDate, activeRepId],
  );
  const heatMapCells = useMemo(
    () => getBookingHeatMapData(bookings, activeRepId, { dateFrom, dateTo }),
    [bookings, activeRepId, dateFrom, dateTo],
  );
  const pickupHeatMapCells = useMemo(
    () => getPickupHeatMapData(callLogs, activeRepId),
    [callLogs, activeRepId],
  );
  const showUpHeatMapCells = useMemo(
    () => getShowUpHeatMapData(bookings, activeRepId, { dateFrom, dateTo, rescheduleSlots }),
    [bookings, activeRepId, dateFrom, dateTo, rescheduleSlots],
  );
  const closeRateHeatMapCells = useMemo(
    () => getCloseRateHeatMapData(bookings, activeRepId, { dateFrom, dateTo }),
    [bookings, activeRepId, dateFrom, dateTo],
  );

  return (
    <div className="space-y-8">
      <TimingGroup title="When to dial" description="Which hours and days pick up, and when sets actually get made.">
        <DialClockCard
          dateFrom={dateFrom}
          dateTo={dateTo}
          activeRepId={activeRepId}
          selectedRepLabel={selectedRepLabel}
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ReportSection title="Pick-up rate by day and hour" description={`Pick-ups ÷ dials${activeRepId ? ` for ${selectedRepLabel}` : ""}. A cell needs 30+ dials to count.`}>
            <PickupHeatMap cells={pickupHeatMapCells} minDials={30} />
          </ReportSection>
          <ReportSection title="Sets by day and hour" description="First meetings booked in this range, by the day and hour they were booked. Second meetings left out.">
            <BookingHeatMap cells={heatMapCells} repLabel={activeRepId ? selectedRepLabel : undefined} />
          </ReportSection>
        </div>
      </TimingGroup>

      <TimingGroup title="Number health" description="Pick-up rate over time and talk time. A falling pick-up rate on steady dials usually means numbers are getting flagged.">
        <PickupRateTrendCard
          dateFrom={dateFrom}
          dateTo={dateTo}
          callLogs={callLogs}
          activeRepId={activeRepId}
          selectedRepLabel={selectedRepLabel}
        />
        <TalkTimePanel dateFrom={dateFrom} dateTo={dateTo} activeRepId={activeRepId} />
      </TimingGroup>

      <TimingGroup title="Conversations" description="Whether pick-ups turn into real conversations. Where calls fall apart stage by stage is on the Setter tracker and Team.">
        <OpenerSurvivalCard dateFrom={dateFrom} dateTo={dateTo} activeRepId={activeRepId} />
      </TimingGroup>

      <TimingGroup title="Meetings by time slot" description="How the meeting time affects whether it sits and closes.">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ReportSection
            title="Show rate by meeting slot"
            description={`First meetings that sat ÷ resolved slots (showed, no-show, cancelled, rescheduled), by the day and hour the meeting was set for${activeRepId ? `, sets by ${selectedRepLabel}` : ""}. A moved meeting counts as rescheduled at its old time. A cell needs 5+ slots to count.`}
          >
            <RateHeatMap cells={showUpHeatMapCells} minSlots={5} hitLabel="showed" baseLabel="slots" emptyMessage="No resolved meetings in this date range." />
          </ReportSection>
          <ReportSection
            title="Close rate by meeting slot"
            description={`Closed ÷ pitched meetings by the day and hour of the pitch${activeRepId ? `, closed by ${selectedRepLabel}` : ""}. First or second meeting; not-qualified leads left out. A cell needs 4+ pitches to count.`}
          >
            <RateHeatMap cells={closeRateHeatMapCells} minSlots={4} hitLabel="closed" baseLabel="pitched" emptyMessage="No pitched meetings in this date range." />
          </ReportSection>
        </div>
      </TimingGroup>

      <ReportSection
        title="Hour by hour, one day"
        description={`Each hour of ${hourlyDate}${activeRepId ? ` (${selectedRepLabel})` : " across all reps"}.`}
        collapsible
        defaultOpen={false}
      >
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Date</span>
          <Input
            type="date"
            value={hourlyDate}
            onChange={(e) => setHourlyDate(e.target.value)}
            className="w-[160px] border-border bg-card text-sm"
          />
        </div>
        <HourlyBreakdownTable rows={hourlyRows} />
      </ReportSection>
    </div>
  );
}

/** A labelled group of Timing panels. */
function TimingGroup({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
