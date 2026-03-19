import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAchievementData } from "@/hooks/useAchievementData";
import { useStreak } from "@/hooks/useStreak";
import {
  Award, Zap, Target, Trophy, Star, Phone, TrendingUp,
  Flame, Crown, DollarSign, Calendar, Rocket, Swords,
  Medal, Shield, BadgeCheck, Gem, CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfettiBurst, useConfettiTrigger } from "@/components/dashboard/ConfettiBurst";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Achievement {
  id: string;
  label: string;
  description: string;
  Icon: React.ElementType;
  unlocked: boolean;
  progress: number;
  glowColor: string;
  iconColor: string;
}

type LongTermTier = "weekly" | "monthly" | "lifetime";

const LONG_TERM_CONFIG: Record<LongTermTier, { label: string; cols: string }> = {
  weekly: { label: "Weekly", cols: "grid-cols-3 lg:grid-cols-6" },
  monthly: { label: "Monthly", cols: "grid-cols-3 lg:grid-cols-5" },
  lifetime: { label: "Lifetime", cols: "grid-cols-3 lg:grid-cols-5" },
};

const DAILY_COLS = "grid-cols-4 lg:grid-cols-7";

// ── Daily Achievements (top of dashboard) ──────────────────────────

export function DailyAchievements() {
  const { user } = useAuth();
  const data = useAchievementData(user?.id);
  const daily = useDailyAchievements(data);
  const unlockedCount = daily.filter((a) => a.unlocked).length;
  const confettiActive = useConfettiTrigger(unlockedCount > 0);

  return (
    <div className="relative rounded-xl border border-border bg-card p-5 overflow-hidden">
      <ConfettiBurst active={confettiActive} />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Daily Achievements
          </h3>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
          <span className="text-xs font-mono font-bold text-primary">{unlockedCount}</span>
          <span className="text-[10px] text-muted-foreground">/ {daily.length} unlocked</span>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary mb-5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-[hsl(var(--outcome-booked))] transition-all duration-1000 ease-out"
          style={{ width: `${(unlockedCount / daily.length) * 100}%` }}
        />
      </div>
      <div className={cn("grid gap-2", DAILY_COLS)}>
        {daily.map((a) => (
          <AchievementBadge key={a.id} achievement={a} />
        ))}
      </div>
    </div>
  );
}

// ── Long-Term Achievements (bottom of dashboard) ───────────────────

export function LongTermAchievements() {
  const { user } = useAuth();
  const data = useAchievementData(user?.id);
  const { data: streak = 0 } = useStreak(user?.id);
  const [tab, setTab] = useState<LongTermTier>("weekly");

  const tiers = useLongTermAchievements(data, streak);
  const totalUnlocked = Object.values(tiers).flat().filter((a) => a.unlocked).length;
  const totalAchievements = Object.values(tiers).flat().length;
  const tierUnlocked = (tier: LongTermTier) => tiers[tier].filter((a) => a.unlocked).length;

  return (
    <div className="relative rounded-xl border border-border bg-card p-5 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Long-Term Achievements
          </h3>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
          <span className="text-xs font-mono font-bold text-primary">{totalUnlocked}</span>
          <span className="text-[10px] text-muted-foreground">/ {totalAchievements} unlocked</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as LongTermTier)}>
        <TabsList className="w-full mb-4">
          {(Object.keys(LONG_TERM_CONFIG) as LongTermTier[]).map((tier) => (
            <TabsTrigger key={tier} value={tier} className="flex-1 gap-1.5 text-xs">
              {LONG_TERM_CONFIG[tier].label}
              <span className="text-[9px] font-mono text-muted-foreground">
                {tierUnlocked(tier)}/{tiers[tier].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(LONG_TERM_CONFIG) as LongTermTier[]).map((tier) => {
          const achievements = tiers[tier];
          const unlocked = achievements.filter((a) => a.unlocked).length;
          return (
            <TabsContent key={tier} value={tier}>
              <div className="h-2 w-full rounded-full bg-secondary mb-5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-[hsl(var(--outcome-booked))] transition-all duration-1000 ease-out"
                  style={{ width: `${(unlocked / achievements.length) * 100}%` }}
                />
              </div>
              <div className={cn("grid gap-2", LONG_TERM_CONFIG[tier].cols)}>
                {achievements.map((a) => (
                  <AchievementBadge key={a.id} achievement={a} />
                ))}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

// ── Badge component ────────────────────────────────────────────────

function AchievementBadge({ achievement: a }: { achievement: Achievement }) {
  return (
    <div
      className={cn(
        "group relative flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all duration-500",
        a.unlocked
          ? `border-[hsl(var(${a.glowColor}))/30] bg-[hsl(var(${a.glowColor}))/5] shadow-[0_0_20px_-4px_hsl(var(${a.glowColor})/0.4)]`
          : "border-border bg-muted/20 hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500",
          a.unlocked ? `bg-[hsl(var(${a.glowColor}))/15]` : "bg-muted",
        )}
      >
        {a.unlocked && (
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{ boxShadow: `0 0 12px 2px hsl(var(${a.glowColor}) / 0.3)` }}
          />
        )}
        <a.Icon
          className={cn(
            "h-5 w-5 transition-all duration-300",
            a.unlocked
              ? `${a.iconColor} drop-shadow-sm`
              : "text-muted-foreground/40 group-hover:text-muted-foreground/60",
          )}
        />
      </div>

      <span
        className={cn(
          "text-[10px] font-bold leading-tight tracking-wide uppercase",
          a.unlocked ? "text-foreground" : "text-muted-foreground/50",
        )}
      >
        {a.label}
      </span>

      <span className="text-[8px] leading-tight text-muted-foreground">{a.description}</span>

      {a.unlocked ? (
        <span
          className="text-[9px] font-bold uppercase tracking-wider"
          style={{ color: `hsl(var(${a.glowColor}))` }}
        >
          ✓ Unlocked
        </span>
      ) : (
        <div className="w-full max-w-[50px]">
          <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${a.progress}%`, backgroundColor: `hsl(var(${a.glowColor}))` }}
            />
          </div>
          <span className="text-[8px] font-mono text-muted-foreground/60 mt-0.5 block">
            {Math.round(a.progress)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ── Data hooks ─────────────────────────────────────────────────────

function useDailyAchievements(data: ReturnType<typeof useAchievementData>): Achievement[] {
  return useMemo(() => [
    {
      id: "first-blood", label: "First Blood", description: "Make your first call today",
      Icon: Zap, unlocked: data.todayCalls >= 1, progress: data.todayCalls >= 1 ? 100 : 0,
      iconColor: "text-primary", glowColor: "--primary",
    },
    {
      id: "warm-up", label: "Warmed Up", description: "Hit 10 calls",
      Icon: Phone, unlocked: data.todayCalls >= 10, progress: Math.min((data.todayCalls / 10) * 100, 100),
      iconColor: "text-[hsl(var(--outcome-follow-up))]", glowColor: "--outcome-follow-up",
    },
    {
      id: "on-fire", label: "On Fire", description: "Smash 25 calls",
      Icon: TrendingUp, unlocked: data.todayCalls >= 25, progress: Math.min((data.todayCalls / 25) * 100, 100),
      iconColor: "text-[hsl(var(--outcome-voicemail))]", glowColor: "--outcome-voicemail",
    },
    {
      id: "target-hit", label: "Target Hit", description: `Reach ${data.dailyTarget} calls`,
      Icon: Target, unlocked: data.todayCalls >= data.dailyTarget,
      progress: Math.min((data.todayCalls / data.dailyTarget) * 100, 100),
      iconColor: "text-[hsl(var(--outcome-booked))]", glowColor: "--outcome-booked",
    },
    {
      id: "closer", label: "Closer", description: "Book 5 appointments",
      Icon: Star, unlocked: data.todayBookings >= 5, progress: Math.min((data.todayBookings / 5) * 100, 100),
      iconColor: "text-[hsl(var(--outcome-booked))]", glowColor: "--outcome-booked",
    },
    {
      id: "perfect-pitch", label: "Perfect Pitch", description: "15%+ booking rate (100+ calls)",
      Icon: BadgeCheck, unlocked: data.todayCalls >= 100 && data.todayPickupRate >= 0.15,
      progress: data.todayCalls >= 100 ? Math.min((data.todayPickupRate / 0.15) * 100, 100) : Math.min((data.todayCalls / 100) * 100, 50),
      iconColor: "text-primary", glowColor: "--primary",
    },
    {
      id: "double-up", label: "Double Up", description: `Hit ${data.dailyTarget * 2} calls`,
      Icon: Flame, unlocked: data.todayCalls >= data.dailyTarget * 2,
      progress: Math.min((data.todayCalls / (data.dailyTarget * 2)) * 100, 100),
      iconColor: "text-[hsl(var(--outcome-voicemail))]", glowColor: "--outcome-voicemail",
    },
  ], [data]);
}

function useLongTermAchievements(
  data: ReturnType<typeof useAchievementData>,
  streak: number,
): Record<LongTermTier, Achievement[]> {
  return useMemo(() => ({
    weekly: [
      {
        id: "monday-momentum", label: "Monday Momentum", description: "100+ calls on Monday",
        Icon: Rocket, unlocked: data.mondayCalls >= 100, progress: Math.min((data.mondayCalls / 100) * 100, 100),
        iconColor: "text-primary", glowColor: "--primary",
      },
      {
        id: "weekly-warrior", label: "Weekly Warrior", description: "Hit target 4/5 days",
        Icon: Shield, unlocked: data.daysHitTargetThisWeek >= 4,
        progress: Math.min((data.daysHitTargetThisWeek / 4) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-follow-up))]", glowColor: "--outcome-follow-up",
      },
      {
        id: "week-slayer", label: "Week Slayer", description: "600+ calls this week",
        Icon: Swords, unlocked: data.weekCalls >= 600, progress: Math.min((data.weekCalls / 600) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-voicemail))]", glowColor: "--outcome-voicemail",
      },
      {
        id: "booking-machine", label: "Booking Machine", description: "20+ bookings this week",
        Icon: CalendarCheck, unlocked: data.weekBookings >= 20,
        progress: Math.min((data.weekBookings / 20) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-booked))]", glowColor: "--outcome-booked",
      },
      {
        id: "iron-will", label: "Iron Will", description: "5-day streak",
        Icon: Award, unlocked: streak >= 5, progress: Math.min((streak / 5) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-voicemail))]", glowColor: "--outcome-voicemail",
      },
      {
        id: "conversion-king", label: "Conversion King", description: "3%+ booking rate (50+ calls)",
        Icon: Crown, unlocked: data.weekCalls >= 50 && data.weekBookingRate >= 0.03,
        progress: data.weekCalls >= 50 ? Math.min((data.weekBookingRate / 0.03) * 100, 100) : Math.min((data.weekCalls / 50) * 100, 50),
        iconColor: "text-primary", glowColor: "--primary",
      },
    ],
    monthly: [
      {
        id: "thousand-club", label: "5K Club", description: "5,000+ calls this month",
        Icon: Phone, unlocked: data.monthCalls >= 5000, progress: Math.min((data.monthCalls / 5000) * 100, 100),
        iconColor: "text-primary", glowColor: "--primary",
      },
      {
        id: "monthly-mvp", label: "Monthly MVP", description: "75+ bookings this month",
        Icon: Star, unlocked: data.monthBookings >= 75, progress: Math.min((data.monthBookings / 75) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-booked))]", glowColor: "--outcome-booked",
      },
      {
        id: "consistency-crown", label: "Consistency Crown", description: "15+ active days",
        Icon: Calendar, unlocked: data.activeDaysThisMonth >= 15,
        progress: Math.min((data.activeDaysThisMonth / 15) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-follow-up))]", glowColor: "--outcome-follow-up",
      },
      {
        id: "cash-collector", label: "Cash Collector", description: "$10,000+ closed",
        Icon: DollarSign, unlocked: data.monthCashCollected >= 10000,
        progress: Math.min((data.monthCashCollected / 10000) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-booked))]", glowColor: "--outcome-booked",
      },
      {
        id: "streak-master", label: "Streak Master", description: "20-day streak",
        Icon: Flame, unlocked: streak >= 20, progress: Math.min((streak / 20) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-voicemail))]", glowColor: "--outcome-voicemail",
      },
    ],
    lifetime: [
      {
        id: "centurion", label: "Centurion", description: "100+ total calls",
        Icon: Trophy, unlocked: data.totalCalls >= 100, progress: Math.min((data.totalCalls / 100) * 100, 100),
        iconColor: "text-primary", glowColor: "--primary",
      },
      {
        id: "1k-club", label: "1K Club", description: "1,000+ total calls",
        Icon: Medal, unlocked: data.totalCalls >= 1000, progress: Math.min((data.totalCalls / 1000) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-follow-up))]", glowColor: "--outcome-follow-up",
      },
      {
        id: "10k-legend", label: "50K Legend", description: "50,000+ total calls",
        Icon: Gem, unlocked: data.totalCalls >= 50000, progress: Math.min((data.totalCalls / 50000) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-voicemail))]", glowColor: "--outcome-voicemail",
      },
      {
        id: "grand-closer", label: "Grand Closer", description: "1,000+ total bookings",
        Icon: Star, unlocked: data.totalBookings >= 1000, progress: Math.min((data.totalBookings / 1000) * 100, 100),
        iconColor: "text-[hsl(var(--outcome-booked))]", glowColor: "--outcome-booked",
      },
      {
        id: "veteran", label: "Veteran", description: "300-day streak",
        Icon: Shield, unlocked: streak >= 300, progress: Math.min((streak / 300) * 100, 100),
        iconColor: "text-primary", glowColor: "--primary",
      },
    ],
  }), [data, streak]);
}
