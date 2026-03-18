import { useEffect, useRef, useState } from "react";
import { Flame, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfettiBurst } from "@/components/dashboard/ConfettiBurst";

interface MilestoneConfig {
  id: string;
  threshold: number;
  title: string;
  subtitle: string;
  emoji: string;
  Icon: React.ElementType;
  glowColor: string;
}

const MILESTONES: MilestoneConfig[] = [
  {
    id: "halfway",
    threshold: 0.5,
    title: "Halfway There!",
    subtitle: "You're crushing it — keep the momentum going!",
    emoji: "🔥",
    Icon: Flame,
    glowColor: "--outcome-voicemail",
  },
  {
    id: "complete",
    threshold: 1.0,
    title: "TARGET SMASHED!",
    subtitle: "You hit your daily goal — absolute legend!",
    emoji: "🏆",
    Icon: Trophy,
    glowColor: "--outcome-booked",
  },
];

interface MilestonePopupProps {
  todaysCalls: number;
  dailyTarget: number;
}

export function MilestonePopup({ todaysCalls, dailyTarget }: MilestonePopupProps) {
  const [visibleMilestone, setVisibleMilestone] = useState<MilestoneConfig | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const [confettiActive, setConfettiActive] = useState(false);

  const pct = dailyTarget > 0 ? todaysCalls / dailyTarget : 0;

  useEffect(() => {
    for (const m of MILESTONES) {
      if (pct >= m.threshold && !firedRef.current.has(m.id)) {
        firedRef.current.add(m.id);
        setVisibleMilestone(m);
        setConfettiActive(true);

        const confettiTimer = setTimeout(() => setConfettiActive(false), 2500);
        const dismissTimer = setTimeout(() => setVisibleMilestone(null), 5000);

        return () => {
          clearTimeout(confettiTimer);
          clearTimeout(dismissTimer);
        };
      }
    }
  }, [pct]);

  if (!visibleMilestone) return null;

  const m = visibleMilestone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm pointer-events-auto animate-fade-in" onClick={() => setVisibleMilestone(null)} />

      {/* Card */}
      <div
        className={cn(
          "relative z-10 w-[340px] rounded-2xl border p-8 text-center pointer-events-auto overflow-hidden",
          "animate-scale-in",
          `border-[hsl(var(${m.glowColor}))/40] bg-card`,
          `shadow-[0_0_60px_-12px_hsl(var(${m.glowColor})/0.5)]`,
        )}
      >
        <ConfettiBurst active={confettiActive} />

        {/* Dismiss */}
        <button
          onClick={() => setVisibleMilestone(null)}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Pulsing icon */}
        <div
          className={cn(
            "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full",
            `bg-[hsl(var(${m.glowColor}))/15]`,
          )}
          style={{
            boxShadow: `0 0 24px 4px hsl(var(${m.glowColor}) / 0.3)`,
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        >
          <m.Icon
            className="h-8 w-8"
            style={{ color: `hsl(var(${m.glowColor}))` }}
          />
        </div>

        <div className="text-3xl mb-2">{m.emoji}</div>

        <h2
          className="text-xl font-black uppercase tracking-wider mb-2"
          style={{ color: `hsl(var(${m.glowColor}))` }}
        >
          {m.title}
        </h2>

        <p className="text-sm text-muted-foreground mb-4">{m.subtitle}</p>

        <div className="flex items-center justify-center gap-2">
          <span className="text-3xl font-black font-mono text-foreground">{todaysCalls}</span>
          <span className="text-sm text-muted-foreground">/ {dailyTarget} calls</span>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${Math.min(pct * 100, 100)}%`,
              background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(${m.glowColor})))`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
