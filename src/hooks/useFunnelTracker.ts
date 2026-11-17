import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchProductiveHoursByDay } from "@/lib/dialpadHours";
import type { CompPlanRow, SetterFirstDeal, TrackerFunnel, TrackerInputRow } from "@/lib/funnelTracker";

/** Daily inputs (rostered hours per setter, ad spend / clicks / leads) for a day range. */
export function useTrackerDailyInputs(from?: string, to?: string) {
  return useQuery({
    queryKey: ["tracker-daily-inputs", from, to],
    enabled: !!from && !!to,
    queryFn: async (): Promise<(TrackerInputRow & { id: string })[]> => {
      const { data, error } = await supabase
        .from("tracker_daily_inputs")
        .select("id, day, funnel, user_id, rostered_hours, ad_spend, clicks, leads")
        .gte("day", from!)
        .lte("day", to!)
        .order("day", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        rostered_hours: r.rostered_hours == null ? null : Number(r.rostered_hours),
        ad_spend: r.ad_spend == null ? null : Number(r.ad_spend),
      }));
    },
  });
}

export interface TrackerTargetRow {
  id: string;
  month: string;
  funnel: string;
  metric: string;
  value: number | null;
}

/** Monthly targets (the sheet's EST columns) for the months a range touches. */
export function useTrackerTargets(fromMonth?: string, toMonth?: string) {
  return useQuery({
    queryKey: ["tracker-targets", fromMonth, toMonth],
    enabled: !!fromMonth && !!toMonth,
    queryFn: async (): Promise<TrackerTargetRow[]> => {
      const { data, error } = await supabase
        .from("tracker_targets")
        .select("id, month, funnel, metric, value")
        .gte("month", fromMonth!)
        .lte("month", toMonth!);
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, value: r.value == null ? null : Number(r.value) }));
    },
  });
}

/** Setter / closer pay plans. Admin and coach only (RLS); reps get an empty list. */
export function useRepCompPlans() {
  return useQuery({
    queryKey: ["rep-comp-plans"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CompPlanRow[]> => {
      const { data, error } = await supabase.from("rep_comp_plans").select("user_id, role, base_annual, plan_key, active_from");
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, base_annual: Number(r.base_annual) || 0 }));
    },
  });
}

export function useProductiveHoursByDay(from?: string, to?: string, enabled = true) {
  return useQuery({
    queryKey: ["productive-hours-by-day", from, to],
    enabled: enabled && !!from && !!to,
    staleTime: 60_000,
    queryFn: () => fetchProductiveHoursByDay(from!, to!),
  });
}

export interface ContactBookingHistoryRow {
  id: string;
  contact_id: string;
  created_at: string;
  created_by: string | null;
  booking_tier: string | null;
}

/**
 * Every booking of the given contacts, for crediting a new client to the
 * setter of the lead's first booking and tagging it with the latest tier.
 * Also returns each contact's team size and monthly revenue for the tier
 * fallback on bookings that have no tier saved.
 */
export function useContactBookingHistory(contactIds: string[]) {
  const key = [...new Set(contactIds)].sort();
  return useQuery({
    queryKey: ["contact-booking-history", key.join(",")],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const history: ContactBookingHistoryRow[] = [];
      const contacts = new Map<string, { team_size: number | null; monthly_revenue: number | null }>();
      for (let i = 0; i < key.length; i += 200) {
        const batch = key.slice(i, i + 200);
        const [hist, cons] = await Promise.all([
          supabase
            .from("pipeline_items")
            .select("id, contact_id, created_at, created_by, booking_tier")
            .eq("pipeline_type", "booked")
            .in("contact_id", batch),
          supabase.from("contacts").select("id, team_size, monthly_revenue").in("id", batch),
        ]);
        if (hist.error) throw hist.error;
        if (cons.error) throw cons.error;
        history.push(...((hist.data ?? []) as ContactBookingHistoryRow[]));
        for (const c of cons.data ?? []) {
          contacts.set(c.id, { team_size: c.team_size, monthly_revenue: c.monthly_revenue == null ? null : Number(c.monthly_revenue) });
        }
      }
      return { history, contacts };
    },
  });
}

export interface DailyInputWrite {
  day: string;
  funnel: TrackerFunnel;
  user_id: string | null;
  rostered_hours?: number | null;
  ad_spend?: number | null;
  clicks?: number | null;
  leads?: number | null;
}

/**
 * Save daily inputs. The unique key is (day, funnel, user_id) but the ads row
 * has no user, and Postgres treats null user ids as distinct, so each row is
 * looked up and updated by id, or inserted when missing.
 */
export function useSaveTrackerDailyInputs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: DailyInputWrite[]) => {
      for (const row of rows) {
        let lookup = supabase
          .from("tracker_daily_inputs")
          .select("id")
          .eq("day", row.day)
          .eq("funnel", row.funnel)
          .order("id", { ascending: true })
          .limit(1);
        lookup = row.user_id ? lookup.eq("user_id", row.user_id) : lookup.is("user_id", null);
        const { data: existing, error: lookupError } = await lookup;
        if (lookupError) throw lookupError;
        const { day, funnel, user_id, ...values } = row;
        if (existing && existing.length > 0) {
          const { error } = await supabase
            .from("tracker_daily_inputs")
            .update({ ...values, updated_at: new Date().toISOString() })
            .eq("id", existing[0].id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("tracker_daily_inputs").insert({ day, funnel, user_id, ...values });
          if (error) throw error;
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tracker-daily-inputs"] });
    },
  });
}

export function useSaveTrackerTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (t: { month: string; funnel: TrackerFunnel; metric: string; value: number | null }) => {
      const { error } = await supabase
        .from("tracker_targets")
        .upsert({ month: t.month, funnel: t.funnel, metric: t.metric, value: t.value }, { onConflict: "month,funnel,metric" });
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tracker-targets"] });
    },
  });
}

/**
 * First deals of setter-credited leads with their payments (the paid marker),
 * from public.get_setter_first_deals. Admin and coach only (RLS); reps get none.
 */
export function useSetterFirstDeals(enabled = true) {
  return useQuery({
    queryKey: ["setter-first-deals"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<SetterFirstDeal[]> => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
      ) => Promise<{ data: unknown; error: unknown }>)("get_setter_first_deals");
      if (error) throw error;
      return ((data ?? []) as SetterFirstDeal[]).map((d) => ({
        ...d,
        amount: Number(d.amount) || 0,
        payments: (d.payments ?? []).map((p) => ({ ...p, amount: Number(p.amount) || 0 })),
      }));
    },
  });
}

/** Record a first-month payment against a deal (the paid marker). */
export function useRecordDealPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p: { deal_id: string; paid_on: string; amount: number; note?: string | null }) => {
      const { error } = await supabase
        .from("client_deal_payments")
        .insert({ deal_id: p.deal_id, paid_on: p.paid_on, amount: p.amount, note: p.note ?? null });
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["setter-first-deals"] });
    },
  });
}
