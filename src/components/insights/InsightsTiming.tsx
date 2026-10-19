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
import { getHourlyMetrics, getBookingHeatMapData, getPickupHeatMapData, getShowUpHeatMapData, getCloseRateHeatMapData } from "@/lib/hourlyMetrics";

interface Props {
  dateFrom: string;
  dateTo: string;
  callLogs: any[];
  bookings: any[];
  activeRepId?: string;
  selectedRepLabel?: string;
}

/**
 * Insights → Timing: every time-of-day view in one place —
 * talk-time heat map, pickup-rate + booking heat maps, hourly drilldown.
 */
export function InsightsTiming({ dateFrom, dateTo, callLogs, bookings, activeRepId, selectedRepLabel }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [hourlyDate, setHourlyDate] = useState(today);

  const hourlyRows = useMemo(
    () => getHourlyMetrics(callLogs, bookings, hourlyDate, activeRepId),
    [callLogs, bookings, hourlyDate, activeRepId],
  );
  const heatMapCells = useMemo(
    () => getBookingHeatMapData(bookings, activeRepId),
    [bookings, activeRepId],
  );
  const pickupHeatMapCells = useMemo(
    () => getPickupHeatMapData(callLogs, activeRepId),
    [callLogs, activeRepId],
  );
  const showUpHeatMapCells = useMemo(
    () => getShowUpHeatMapData(bookings, activeRepId),
    [bookings, activeRepId],
  );
  const closeRateHeatMapCells = useMemo(
    () => getCloseRateHeatMapData(bookings, activeRepId),
    [bookings, activeRepId],
  );

  return (
    <div className="space-y-5">
      <DialClockCard
        dateFrom={dateFrom}
        dateTo={dateTo}
        activeRepId={activeRepId}
        selectedRepLabel={selectedRepLabel}
      />
      <OpenerSurvivalCard dateFrom={dateFrom} dateTo={dateTo} activeRepId={activeRepId} />
      <PickupRateTrendCard
        dateFrom={dateFrom}
        dateTo={dateTo}
        callLogs={callLogs}
        activeRepId={activeRepId}
        selectedRepLabel={selectedRepLabel}
      />
      <TalkTimePanel dateFrom={dateFrom} dateTo={dateTo} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ReportSection title="Pick-Up Rate Heat Map" description={`Pickup % intensity by day of week and hour${activeRepId ? ` for ${selectedRepLabel}` : ""}.`}>
          <PickupHeatMap cells={pickupHeatMapCells} />
        </ReportSection>
        <ReportSection title="Booking Heat Map" description="Booking density by day of week and hour.">
          <BookingHeatMap cells={heatMapCells} repLabel={activeRepId ? selectedRepLabel : undefined} />
        </ReportSection>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ReportSection
          title="Show-Up Rate Heat Map"
          description={`Share of first meetings that sat, by the day and hour the meeting was scheduled for${activeRepId ? `, sets by ${selectedRepLabel}` : ""}. Showed ÷ resolved slots; follow-ups excluded.`}
        >
          <RateHeatMap cells={showUpHeatMapCells} hitLabel="showed" baseLabel="slots" emptyMessage="No resolved meetings in this date range." />
        </ReportSection>
        <ReportSection
          title="Close Rate Heat Map"
          description={`Closed ÷ pitched meetings by the day and hour of the pitch${activeRepId ? `, closed by ${selectedRepLabel}` : ""}. First or second meeting; not-qualified leads excluded.`}
        >
          <RateHeatMap cells={closeRateHeatMapCells} minSlots={2} hitLabel="closed" baseLabel="pitched" emptyMessage="No pitched meetings in this date range." />
        </ReportSection>
      </div>

      <ReportSection
        title="Hourly Breakdown"
        description={`Hour-by-hour activity for ${hourlyDate}${activeRepId ? ` (${selectedRepLabel})` : " across all reps"}.`}
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
