import { CalendarClock, Gauge, ListChecks, Medal, RefreshCcw, Video } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * The manager playbook: how to run the ongoing training rhythm for certified
 * reps. Admin/coach-facing — the counterpart of the reps' 14-day program.
 */
export function ManagerPlaybook() {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" /> The weekly call review — 45 min, hard stop
          </CardTitle>
          <CardDescription>Same day every week, never during peak dialling hours. Exactly three calls:</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p><span className="font-medium">1. "What good looks like"</span> <span className="text-muted-foreground">— a booked call from a MID-PACK rep, not the star. The team needs to believe good is reachable.</span></p>
          <p><span className="font-medium">2. "Where it broke"</span> <span className="text-muted-foreground">— a good conversation that didn't book. Highest learning density on the board.</span></p>
          <p><span className="font-medium">3. "Opener autopsy"</span> <span className="text-muted-foreground">— a call that died in 30 seconds.</span></p>
          <p className="pt-1 text-xs text-muted-foreground">
            Order of speaking: the rep self-diagnoses first, the room coaches second, the manager speaks LAST and talks
            under 30% of the time — more than half and it's a lecture, not a review. Reps must have read their own AI
            coaching on the call before the session; if they haven't, skip their call. That trains self-coaching.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" /> Day to day — 5 minutes, morning and end of day
          </CardTitle>
          <CardDescription>Dashboard, not individual coach reports. No micromanaging.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p><span className="font-medium">Look at:</span> <span className="text-muted-foreground">pickup→conversation rate per rep · answered calls over 5 min with no disposition · calls over 15 min that didn't book.</span></p>
          <p><span className="font-medium">Ignore:</span> <span className="text-muted-foreground">low coach scores on cold scraped leads (perfect execution can still not book on garbage leads) · reps hitting target (get out of their way) · AI tonality commentary (it can't hear tone).</span></p>
          <p><span className="font-medium">Step in on three triggers:</span> <span className="text-muted-foreground">2 consecutive days below-average pickup→conversation · zero bookings in 3 days despite adequate dials · average call length under 90 seconds across a full day.</span></p>
          <p className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
            <Video className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            All day-to-day coaching goes out as a 3-5 minute Loom, never a Slack message or a live pull-aside.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" /> The only three numbers that matter weekly
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p><span className="font-medium">1. Pickup → 2-min conversation rate</span> <span className="text-muted-foreground">— isolates the opener (Insights → Timing has it live).</span></p>
          <p><span className="font-medium">2. Bookings per 100 dials, stream-adjusted</span> <span className="text-muted-foreground">— the whole funnel in one number.</span></p>
          <p><span className="font-medium">3. Show rate of booked sessions</span> <span className="text-muted-foreground">— the quality number; target 70%+ on cold scraped.</span></p>
          <p className="pt-1 text-xs text-muted-foreground">
            Do NOT track weekly: close rate (an offer metric, not a cold-caller skill metric), dial count (a management
            conversation, not coaching), or average call length as a KPI (diagnostic only).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Medal className="h-4 w-4 text-primary" /> Leaderboards — private, always
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p className="text-muted-foreground">
            The manager sees the full ranking; each rep sees only their own position and the team average. Public
            leaderboards on a cold-calling team demoralise the bottom and reward the wrong things.
          </p>
          <p><span className="font-medium">Rank on:</span> <span className="text-muted-foreground">bookings per 100 dials, stream-adjusted.</span></p>
          <p><span className="font-medium">Never rank on:</span> <span className="text-muted-foreground">total dials (rewards spam) · close rate (rewards cherry-picking) · raw bookings without show-rate context (rewards garbage bookings).</span></p>
          <p className="pt-1 text-xs text-muted-foreground">
            The one competition that works: a monthly blind challenge — everyone who hits their booking target AND holds
            70%+ show rate enters a draw. Not zero-sum; everyone who hits the standard has a shot.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCcw className="h-4 w-4 text-primary" /> 30-day recertification & veteran remediation
          </CardTitle>
          <CardDescription>Certification gets you on the floor; sustained performance keeps you there.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p className="font-medium">Four triggers back into remediation:</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">Pickup→conversation &lt; 60% for 5 dialling days</Badge>
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">0 bookings in 5 days despite 60+ dials/day</Badge>
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">Show rate &lt; 50% for 2 weeks</Badge>
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">Same milestone failure on 10+ calls in 7 days</Badge>
          </div>
          <p className="pt-1 text-muted-foreground">
            Veteran remediation is a <span className="font-medium text-foreground">2-5 day targeted reset</span>, never a
            re-onboarding: Day 1 diagnose (pull 5 calls, find ONE pattern) → Days 1-2 targeted roleplay on just the broken
            section (3 clean passes to move on) → Days 2-3 shadow dialling with live coaching → Days 3-5 solo
            re-verification monitored by the AI coach. Clear it and there's no mark on the record. Fail re-verification
            twice and it's a performance-plan conversation, not another loop.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
