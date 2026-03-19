import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { deriveAllTargets } from "@/lib/performanceTargets";

const DEFAULT_DAILY_TARGET = 50;

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = start
  const s = new Date(d);
  s.setDate(s.getDate() - diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function toLocalDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isLocalToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isLocalThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return d >= weekStart && d < weekEnd;
}

function isLocalThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export interface AchievementData {
  // Daily
  todayCalls: number;
  todayBookings: number;
  todayPickupRate: number; // booking/total ratio
  dailyTarget: number;

  // Weekly
  weekCalls: number;
  weekBookings: number;
  weekBookingRate: number;
  mondayCalls: number; // calls made on Monday this week
  daysHitTargetThisWeek: number;

  // Monthly
  monthCalls: number;
  monthBookings: number;
  activeDaysThisMonth: number;
  monthCashCollected: number;

  // Lifetime
  totalCalls: number;
  totalBookings: number;
}

const ANSWERED_OUTCOMES = new Set(["booked", "not_interested", "follow_up"]);

export function useAchievementData(userId?: string) {
  const { data: targets = [] } = usePerformanceTargets();

  // Fetch user's call logs (all time, batched)
  const { data: callLogs = [] } = useQuery({
    queryKey: ["achievement-call-logs", userId],
    queryFn: async () => {
      if (!userId) return [];
      const allRows: Array<{ created_at: string; outcome: string }> = [];
      let page = 0;
      const BATCH = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("call_logs")
          .select("created_at, outcome")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .range(page * BATCH, (page + 1) * BATCH - 1);
        if (error) throw error;
        allRows.push(...(data ?? []));
        if (!data || data.length < BATCH) break;
        page++;
      }
      return allRows;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  // Fetch monthly cash collected from pipeline_items
  const { data: monthCash = 0 } = useQuery({
    queryKey: ["achievement-month-cash", userId],
    queryFn: async () => {
      if (!userId) return 0;
      const ms = startOfMonth(new Date()).toISOString();
      const { data, error } = await supabase
        .from("pipeline_items")
        .select("deal_value")
        .eq("pipeline_type", "booked")
        .eq("appointment_outcome", "showed_closed")
        .eq("created_by", userId)
        .gte("outcome_recorded_at", ms);
      if (error) throw error;
      return (data ?? []).reduce((sum, r) => sum + (Number(r.deal_value) || 0), 0);
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const dailyTarget = useMemo(() => {
    if (!userId) return DEFAULT_DAILY_TARGET;
    const derived = deriveAllTargets(targets);
    const dt = derived.individualDaily.find(
      (t) => t.user_id === userId && t.metric_key === "dials"
    );
    return dt?.target_value && dt.target_value > 0 ? Math.round(dt.target_value) : DEFAULT_DAILY_TARGET;
  }, [targets, userId]);

  return useMemo<AchievementData>(() => {
    const now = new Date();
    const todayDay = now.getDay(); // 0=Sun
    const weekStart = startOfWeek(now);

    let todayCalls = 0, todayBookings = 0, todayAnswered = 0;
    let weekCalls = 0, weekBookings = 0, weekAnswered = 0, mondayCalls = 0;
    let monthCalls = 0, monthBookings = 0;
    let totalBookings = 0;

    const monthDays = new Set<string>();
    const weekDailyCountMap = new Map<string, number>();

    for (const log of callLogs) {
      const isBooked = log.outcome === "booked";
      const isAnswered = ANSWERED_OUTCOMES.has(log.outcome);

      totalBookings += isBooked ? 1 : 0;

      if (isLocalToday(log.created_at)) {
        todayCalls++;
        if (isBooked) todayBookings++;
        if (isAnswered) todayAnswered++;
      }

      if (isLocalThisWeek(log.created_at)) {
        weekCalls++;
        if (isBooked) weekBookings++;
        if (isAnswered) weekAnswered++;

        const d = new Date(log.created_at);
        if (d.getDay() === 1) mondayCalls++; // Monday

        const dayKey = toLocalDateKey(log.created_at);
        weekDailyCountMap.set(dayKey, (weekDailyCountMap.get(dayKey) || 0) + 1);
      }

      if (isLocalThisMonth(log.created_at)) {
        monthCalls++;
        if (isBooked) monthBookings++;
        monthDays.add(toLocalDateKey(log.created_at));
      }
    }

    // Days that hit target this week
    let daysHitTargetThisWeek = 0;
    for (const count of weekDailyCountMap.values()) {
      if (count >= dailyTarget) daysHitTargetThisWeek++;
    }

    return {
      todayCalls,
      todayBookings,
      todayPickupRate: todayCalls >= 100 ? todayBookings / todayCalls : 0,
      dailyTarget,
      weekCalls,
      weekBookings,
      weekBookingRate: weekCalls >= 50 ? weekBookings / weekCalls : 0,
      mondayCalls,
      daysHitTargetThisWeek,
      monthCalls,
      monthBookings,
      activeDaysThisMonth: monthDays.size,
      monthCashCollected: monthCash,
      totalCalls: callLogs.length,
      totalBookings,
    };
  }, [callLogs, monthCash, dailyTarget]);
}
