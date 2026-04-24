import { StatCard } from "@/components/StatCard";
import { formatDurationSeconds } from "@/lib/duration";
import type { ReportMetrics } from "@/lib/reportMetrics";
import { CONVERSATION_TAGGING_LAUNCH_LABEL } from "@/data/constants";

interface HeadlineKpiStripProps {
  metrics: ReportMetrics;
}

export function HeadlineKpiStrip({ metrics }: HeadlineKpiStripProps) {
  const { dialer, bookingsMade } = metrics;
  const convoBooking = dialer.conversationToBookingRate; // number | null
  const convoSubtext = convoBooking === null
    ? `No data before ${CONVERSATION_TAGGING_LAUNCH_LABEL}`
    : dialer.conversationMetricsScoped
      ? `Since ${CONVERSATION_TAGGING_LAUNCH_LABEL}`
      : "closing skill";

  return (
    <div className="space-y-2">
      {/* Row 1 — Activity */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard compact label="Dials" value={dialer.dials} />
        <StatCard compact label="Pick Ups" value={dialer.pickUps} />
        <StatCard compact label="Pick Up Rate" value={`${dialer.pickUpRate}%`} />
        <StatCard compact label="Talk Time" value={formatDurationSeconds(dialer.totalTalkTimeSeconds)} />
      </div>

      {/* Row 2 — Outcomes (what matters most for a setter) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          compact
          label="Conversations"
          value={dialer.conversations}
          subtext="reached connection"
        />
        <StatCard
          compact
          label="Bookings Made"
          value={bookingsMade.totalBookingsMade}
          subtext={bookingsMade.newBookings > 0 || bookingsMade.rebooked > 0
            ? `${bookingsMade.newBookings} new · ${bookingsMade.rebooked} rebooked`
            : "by date booked"}
        />
        <StatCard
          compact
          label="Pickup → Booking"
          value={`${bookingsMade.pickUpsToBookingRate}%`}
          subtext="bookings / pick ups"
        />
        <StatCard
          compact
          label="Conversation → Booking"
          value={convoBooking === null ? "—" : `${convoBooking}%`}
          subtext={convoSubtext}
        />
        <StatCard
          compact
          label="Immediate Hang-Ups"
          value={dialer.immediateHangUps}
          subtext={`${dialer.immediateHangUpRate}% of dials`}
        />
      </div>
    </div>
  );
}