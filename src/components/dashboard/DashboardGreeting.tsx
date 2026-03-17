import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTodayCallCount } from "@/hooks/useCallLogs";
import { useStreak } from "@/hooks/useStreak";
import { supabase } from "@/integrations/supabase/client";
import { Flame, Sparkles, Sun, Moon, CloudSun } from "lucide-react";

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", Icon: Sun };
  if (h < 17) return { text: "Good afternoon", Icon: CloudSun };
  return { text: "Good evening", Icon: Moon };
}

function getMotivation(calls: number) {
  if (calls === 0) return "Let's crush it today! 🎯";
  if (calls < 10) return "Great start — keep the momentum going!";
  if (calls < 25) return "You're on fire! Don't stop now 🔥";
  if (calls < 50) return "Incredible pace! You're a machine 💪";
  return "LEGENDARY performance today! 🏆";
}

export function DashboardGreeting() {
  const { user } = useAuth();
  const { data: todaysCalls = 0 } = useTodayCallCount(user?.id);
  const { data: streak = 0 } = useStreak(user?.id);
  const { text: greeting, Icon: TimeIcon } = getTimeGreeting();
  const [firstName, setFirstName] = useState("there");

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_name) setFirstName(data.display_name.split(" ")[0]);
      });
  }, [user?.id]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <TimeIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {greeting}, {firstName}!
            </h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {getMotivation(todaysCalls)}
            </p>
          </div>
        </div>

        {streak > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5">
            <Flame className="h-4 w-4 text-[hsl(var(--outcome-voicemail))]" />
            <span className="text-sm font-bold font-mono text-foreground">{streak}</span>
            <span className="text-xs text-muted-foreground">day streak</span>
          </div>
        )}
      </div>
    </div>
  );
}
