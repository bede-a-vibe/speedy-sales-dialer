import type { SourceFunnelRow } from "@/hooks/useMeetings";

export interface SourceFunnelTotals {
  meetings: number;
  showed: number;
  noshow: number;
  cancelled: number;
  rescheduled: number;
  resolved: number;
  pending: number;
  reschedules: number;
  upcoming: number;
  contactsBooked: number;
  contactsShowed: number;
  won: number;
  mrr: number;
  amount: number;
  /** showed ÷ every resolved slot (showed + no-show + cancelled + rescheduled). */
  showRate: number | null;
  closeFromShow: number | null;
  closeFromBooked: number | null;
}

const rate = (num: number, den: number) => (den > 0 ? Math.round((1000 * num) / den) / 10 : null);

/** Sum get_source_funnel rows with the same definitions the RPC uses per row. */
export function totalSourceRows(rows: SourceFunnelRow[]): SourceFunnelTotals {
  const sum = (key: keyof SourceFunnelRow) => rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
  const showed = sum("showed");
  const noshow = sum("noshow");
  const cancelled = sum("cancelled");
  const rescheduled = sum("rescheduled");
  const resolved = showed + noshow + cancelled + rescheduled;
  const contactsBooked = sum("contacts_booked");
  const contactsShowed = sum("contacts_showed");
  const won = sum("contacts_won");
  return {
    meetings: sum("meetings_booked"),
    showed,
    noshow,
    cancelled,
    rescheduled,
    resolved,
    pending: sum("pending"),
    reschedules: sum("reschedules"),
    upcoming: sum("upcoming"),
    contactsBooked,
    contactsShowed,
    won,
    mrr: sum("mrr"),
    amount: sum("total_amount"),
    showRate: rate(showed, resolved),
    closeFromShow: rate(won, contactsShowed),
    closeFromBooked: rate(won, contactsBooked),
  };
}

/** URL-safe key for a channel name: "Cold Call" -> "cold-call". */
export function channelSlug(channel: string): string {
  return channel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Channels the picker always offers, in this order, even with no meetings in range. */
export const PINNED_CHANNELS = ["Cold Call", "Ads"] as const;
const CHANNEL_ORDER = ["Cold Call", "Ads", "Website", "Referral"];

/** Channel picker options: pinned channels first, then the rest by volume, Unattributed last. */
export function channelOptions(rows: SourceFunnelRow[]): { channel: string; slug: string; meetings: number }[] {
  const byChannel = new Map<string, number>();
  for (const c of PINNED_CHANNELS) byChannel.set(c, 0);
  for (const r of rows) byChannel.set(r.channel, (byChannel.get(r.channel) ?? 0) + (Number(r.meetings_booked) || 0));
  const rank = (c: string) => {
    if (c === "Unattributed") return 1000;
    const i = CHANNEL_ORDER.indexOf(c);
    return i === -1 ? 100 : i;
  };
  return [...byChannel.entries()]
    .map(([channel, meetings]) => ({ channel, slug: channelSlug(channel), meetings }))
    .sort((a, b) => rank(a.channel) - rank(b.channel) || b.meetings - a.meetings);
}
