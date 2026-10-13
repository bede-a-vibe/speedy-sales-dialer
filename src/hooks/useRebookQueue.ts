import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { AppointmentOutcomeValue } from "@/lib/appointments";

export type RebookBucket = "no_show" | "cancelled" | "rescheduled";

export interface RebookNote {
  id: string;
  content: string;
  created_at: string;
  source: string;
}

export interface RebookCall {
  created_at: string;
  outcome: string | null;
  notes: string | null;
  dialpad_summary: string | null;
}

export interface RebookQueueItem {
  id: string;
  contact_id: string;
  bucket: RebookBucket;
  scheduled_for: string | null;
  appointment_outcome: AppointmentOutcomeValue | null;
  outcome_reason: string | null;
  outcome_notes: string | null;
  outcome_recorded_at: string | null;
  reschedule_count: number;
  created_by: string;
  assigned_user_id: string;
  is_qualified: boolean | null;
  contact: Tables<"contacts">;
  /** Booked slots this contact has had in the lookback window. */
  bookingsCount: number;
  /** How many of those were no-shows. */
  missedCount: number;
  notes: RebookNote[];
  lastCall: RebookCall | null;
  /** Open follow-up task for this contact, if the no-show trigger created one. */
  followUpDue: string | null;
}

export const REBOOK_LOOKBACK_DAYS = 60;

/** Contacts in these states are not rebook candidates even if their last meeting was missed. */
const CLOSED_CONTACT_STATUSES = new Set(["not_interested", "closed", "client", "dnc", "do_not_call", "disqualified", "lost"]);

type RawBooking = {
  id: string;
  contact_id: string;
  status: string;
  scheduled_for: string | null;
  appointment_outcome: AppointmentOutcomeValue | null;
  outcome_reason: string | null;
  outcome_notes: string | null;
  outcome_recorded_at: string | null;
  reschedule_count: number | null;
  created_by: string;
  assigned_user_id: string;
  is_qualified: boolean | null;
  contacts: Tables<"contacts"> | null;
};

/**
 * Which rebook bucket a contact's LATEST booking puts them in, or null when there is
 * nothing to chase (they showed, they have a fresh booking, or the slot is still pending).
 */
export function bucketForLatest(latest: Pick<RawBooking, "status" | "scheduled_for" | "appointment_outcome" | "reschedule_count">, now = Date.now()): RebookBucket | null {
  if (latest.status === "canceled" || latest.appointment_outcome === "cancelled") return "cancelled";
  if (latest.appointment_outcome === "no_show") return "no_show";
  const when = latest.scheduled_for ? new Date(latest.scheduled_for).getTime() : null;
  const upcoming = when !== null && when >= now;
  if (upcoming && latest.status === "open" && (latest.appointment_outcome === "rescheduled" || (latest.reschedule_count ?? 0) > 0)) {
    return "rescheduled";
  }
  return null;
}

const IMPORT_NOTE_PREFIX = "Imported builder metadata";

export function useRebookQueue() {
  return useQuery({
    queryKey: ["rebook-queue"],
    staleTime: 30_000,
    queryFn: async (): Promise<RebookQueueItem[]> => {
      const since = new Date(Date.now() - REBOOK_LOOKBACK_DAYS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("pipeline_items")
        .select(
          "id, contact_id, status, scheduled_for, appointment_outcome, outcome_reason, outcome_notes, outcome_recorded_at, reschedule_count, created_by, assigned_user_id, is_qualified, contacts(*)",
        )
        .eq("pipeline_type", "booked")
        .gte("scheduled_for", since)
        .order("scheduled_for", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as unknown as RawBooking[];
      const byContact = new Map<string, RawBooking[]>();
      for (const row of rows) {
        if (!row.contact_id) continue;
        const list = byContact.get(row.contact_id) ?? [];
        list.push(row);
        byContact.set(row.contact_id, list);
      }

      const now = Date.now();
      const candidates: RebookQueueItem[] = [];
      for (const list of byContact.values()) {
        const latest = list[0];
        const contact = latest.contacts;
        if (!contact) continue;
        if (CLOSED_CONTACT_STATUSES.has(String(contact.status ?? "").toLowerCase())) continue;
        const bucket = bucketForLatest(latest, now);
        if (!bucket) continue;
        candidates.push({
          id: latest.id,
          contact_id: latest.contact_id,
          bucket,
          scheduled_for: latest.scheduled_for,
          appointment_outcome: latest.appointment_outcome,
          outcome_reason: latest.outcome_reason,
          outcome_notes: latest.outcome_notes,
          outcome_recorded_at: latest.outcome_recorded_at,
          reschedule_count: latest.reschedule_count ?? 0,
          created_by: latest.created_by,
          assigned_user_id: latest.assigned_user_id,
          is_qualified: latest.is_qualified,
          contact,
          bookingsCount: list.length,
          missedCount: list.filter((r) => r.appointment_outcome === "no_show").length,
          notes: [],
          lastCall: null,
          followUpDue: null,
        });
      }
      if (candidates.length === 0) return [];

      const ids = candidates.map((c) => c.contact_id);
      const [notesRes, callsRes, followRes] = await Promise.all([
        supabase
          .from("contact_notes")
          .select("id, contact_id, content, created_at, source")
          .in("contact_id", ids)
          .not("content", "ilike", `${IMPORT_NOTE_PREFIX}%`)
          .order("created_at", { ascending: false })
          .limit(400),
        supabase
          .from("call_logs")
          .select("contact_id, created_at, outcome, notes, dialpad_summary")
          .in("contact_id", ids)
          .order("created_at", { ascending: false })
          .limit(400),
        supabase
          .from("pipeline_items")
          .select("contact_id, scheduled_for")
          .eq("pipeline_type", "follow_up")
          .eq("status", "open")
          .in("contact_id", ids),
      ]);
      if (notesRes.error) throw notesRes.error;
      if (callsRes.error) throw callsRes.error;
      if (followRes.error) throw followRes.error;

      const notesBy = new Map<string, RebookNote[]>();
      for (const n of notesRes.data ?? []) {
        const list = notesBy.get(n.contact_id) ?? [];
        if (list.length < 3 && n.content?.trim()) {
          list.push({ id: n.id, content: n.content, created_at: n.created_at, source: String(n.source) });
        }
        notesBy.set(n.contact_id, list);
      }
      const callBy = new Map<string, RebookCall>();
      for (const c of callsRes.data ?? []) {
        if (!c.contact_id) continue;
        const existing = callBy.get(c.contact_id);
        const hasContent = Boolean(c.dialpad_summary?.trim() || c.notes?.trim());
        // Keep the most recent call that actually says something; fall back to the most recent call.
        if (!existing || (hasContent && !(existing.dialpad_summary?.trim() || existing.notes?.trim()))) {
          callBy.set(c.contact_id, {
            created_at: c.created_at,
            outcome: c.outcome ? String(c.outcome) : null,
            notes: c.notes,
            dialpad_summary: c.dialpad_summary,
          });
        }
      }
      const followBy = new Map<string, string>();
      for (const f of followRes.data ?? []) {
        if (!f.contact_id || !f.scheduled_for) continue;
        const current = followBy.get(f.contact_id);
        if (!current || f.scheduled_for < current) followBy.set(f.contact_id, f.scheduled_for);
      }

      return candidates
        .map((c) => ({
          ...c,
          notes: notesBy.get(c.contact_id) ?? [],
          lastCall: callBy.get(c.contact_id) ?? null,
          followUpDue: followBy.get(c.contact_id) ?? null,
        }))
        .sort((a, b) => (b.scheduled_for ?? "").localeCompare(a.scheduled_for ?? ""));
    },
  });
}
