import type { ReportMetrics } from "@/lib/reportMetrics";
import { StatCard } from "@/components/StatCard";
import { formatDurationSeconds } from "@/lib/duration";
import { CONVERSATION_TAGGING_LAUNCH_LABEL } from "@/data/constants";

interface Props {
  metrics: ReportMetrics;
}

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export function ConversionRateStrip({ metrics }: Props) {
  const setter = metrics.appointmentPerformance.setter;
  const dialPickup = metrics.dialer.pickUpRate;
  const conversations = metrics.dialer.conversations;
  const scoped = metrics.dialer.conversationMetricsScoped;
  const conversationBooking = metrics.dialer.conversationToBookingRate; // number | null
  // Pickup → Conversation: scope the same way as conversations themselves.
  // If we have zero conversations AND the rate has been forced to null, render "—".
  const pickupConversationValue: number | null =
    conversationBooking === null
      ? null
      : pct(conversations, metrics.dialer.pickUps);
  const sinceSubtext = scoped ? `Since ${CONVERSATION_TAGGING_LAUNCH_LABEL}` : undefined;
  const noDataSubtext = `No data before ${CONVERSATION_TAGGING_LAUNCH_LABEL}`;
  const pickupBooking = metrics.bookingsMade.pickUpsToBookingRate;
  const bookingShowed = pct(setter.showed, setter.appointmentsScheduled);
  const showedClosed = setter.closeRate;
  const leadBooked = pct(metrics.bookingsMade.totalBookingsMade, metrics.dialer.uniqueLeadsDialed);
  const costPerConv = metrics.dialer.conversations > 0
    ? Math.round(metrics.dialer.totalTalkTimeSeconds / metrics.dialer.conversations)
    : 0;

  return (
    <div className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Key Conversion Rates</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard compact label="Dial → Pickup" value={`${dialPickup}%`} />
        <StatCard
          compact
          label="Pickup → Conversation"
          value={pickupConversationValue === null ? "—" : `${pickupConversationValue}%`}
          subtext={pickupConversationValue === null ? noDataSubtext : sinceSubtext}
        />
        <StatCard
          compact
          label="Conversation → Booking"
          value={conversationBooking === null ? "—" : `${conversationBooking}%`}
          subtext={conversationBooking === null ? noDataSubtext : sinceSubtext}
        />
        <StatCard compact label="Pickup → Booking" value={`${pickupBooking}%`} />
        <StatCard compact label="Booking → Showed" value={`${bookingShowed}%`} />
        <StatCard compact label="Showed → Closed" value={`${showedClosed}%`} />
        <StatCard compact label="Lead → Booked" value={`${leadBooked}%`} />
        <StatCard
          compact
          label="Talk / Conversation"
          value={formatDurationSeconds(costPerConv)}
          subtext="avg time per conv"
        />
      </div>
    </div>
  );
}