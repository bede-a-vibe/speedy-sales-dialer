import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTodayCallCount } from "@/hooks/useCallLogs";
import { useStreak } from "@/hooks/useStreak";
import { supabase } from "@/integrations/supabase/client";
import { Flame, Sparkles, Sun, Moon, CloudSun, Rocket } from "lucide-react";

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", Icon: Sun };
  if (h < 17) return { text: "Good afternoon", Icon: CloudSun };
  return { text: "Good evening", Icon: Moon };
}

function getMotivation(calls: number, streak: number) {
  if (calls === 0 && streak > 0) return `${streak}-day streak on the line — let's keep it alive! 🔥`;
  if (calls === 0) return "Ready to make today count? Let's go! 🎯";
  if (calls < 10) return "Great start — keep the momentum rolling!";
  if (calls < 25) return "You're heating up! Don't stop now 🔥";
  if (calls < 50) return "Incredible pace — you're a machine 💪";
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
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <TimeIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {greeting}, {firstName}!
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {getMotivation(todaysCalls, streak)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {streak > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--outcome-voicemail))]/30 bg-[hsl(var(--outcome-voicemail))]/5 px-4 py-2">
            <Flame className="h-4 w-4 text-[hsl(var(--outcome-voicemail))]" />
            <span className="text-sm font-bold font-mono text-foreground">{streak}</span>
            <span className="text-xs text-muted-foreground">day streak</span>
          </div>
        )}
        {todaysCalls > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2">
            <Rocket className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold font-mono text-foreground">{todaysCalls}</span>
            <span className="text-xs text-muted-foreground">calls today</span>
          </div>
        )}
      </div>
    </div>
  );
}
