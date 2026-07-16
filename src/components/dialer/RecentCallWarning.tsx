import { useQuery } from "@tanstack/react-query";
import { PhoneIncoming } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatTalk } from "@/hooks/useDialpadCallStats";

const LOOKBACK_DAYS = 7;
/** Ignore very fresh rows so the call the rep is on right now doesn't trigger the warning. */
const SELF_NOISE_MINUTES = 10;

function last9(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

interface RecentDialpadCall {
  started_at: string;
  talk_time_seconds: number | null;
  call_log_id: string | null;
  external_number: string | null;
}

/**
 * Ground-truth repeat-call guard: checks Dialpad's own call history (synced
 * every 3 min) for the lead's numbers — catches earlier calls even when no
 * outcome was logged (crashed sessions, manual Dialpad dials, duplicate leads
 * sharing a number).
 */
export function RecentCallWarning({ phone, dmPhone, contactId }: { phone: string | null; dmPhone?: string | null; contactId: string }) {
  const p9 = last9(phone);
  const d9 = last9(dmPhone);

  const { data: calls = [] } = useQuery({
    queryKey: ["recent-call-warning", contactId, p9, d9],
    enabled: Boolean(p9 || d9),
    staleTime: 60_000,
    queryFn: async (): Promise<RecentDialpadCall[]> => {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
      const cutoff = new Date(Date.now() - SELF_NOISE_MINUTES * 60_000).toISOString();
      const patterns = [p9, d9].filter(Boolean).map((d) => `external_number.like.%${d}`);
      const { data, error } = await supabase
        .from("dialpad_calls")
        .select("started_at, talk_time_seconds, call_log_id, external_number")
        .or(patterns.join(","))
        .gte("started_at", since)
        .lt("started_at", cutoff)
        .order("started_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as RecentDialpadCall[];
    },
  });

  if (calls.length === 0) return null;
  const latest = calls[0];
  const when = new Date(latest.started_at).toLocaleString("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const talk = latest.talk_time_seconds ?? 0;

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-amber-900 dark:text-amber-100">
      <PhoneIncoming className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
      <div className="text-sm leading-snug">
        <p className="text-[10px] font-mono uppercase tracking-widest text-amber-800 dark:text-amber-300">
          Recent call to this number
        </p>
        <p>
          Called <span className="font-semibold">{when}</span>
          {talk > 0 ? <> — <span className="font-semibold">{formatTalk(talk)}</span> talk</> : " — no connect"}
          {latest.call_log_id ? "." : <span className="font-medium"> · no outcome was logged.</span>}
          {calls.length > 1 && <span className="text-amber-800/80 dark:text-amber-200/80"> ({calls.length} calls in the last {LOOKBACK_DAYS} days.)</span>}
        </p>
      </div>
    </div>
  );
}
