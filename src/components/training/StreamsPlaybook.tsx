import { Snowflake, PhoneForwarded, Megaphone, MailOpen, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Stream {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  who: string;
  opener: string;
  openerLine: string;
  bigMistake: string;
  good: string;
  askSeverity: "Lenient" | "Moderate" | "Moderate-strict" | "Strict" | "Strictest";
  askNote: string;
}

const SEVERITY_STYLES: Record<Stream["askSeverity"], string> = {
  Lenient: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  Moderate: "border-border bg-muted text-muted-foreground",
  "Moderate-strict": "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Strict: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  Strictest: "border-destructive/40 bg-destructive/10 text-destructive",
};

/**
 * The five lead streams and how the playbook changes per stream. Grading
 * severity scales with the prospect's intent — the coach grades the booking
 * ask hardest where they already raised their hand. Same taxonomy as the
 * AI coach's `stream` field.
 */
const STREAMS: Stream[] = [
  {
    key: "cold_first_touch",
    label: "Cold first touch",
    icon: Snowflake,
    who: "Scraped from Google Maps. Zero permission, zero warmth — you are an interruption, and the opener is everything.",
    opener: "Casual and honest. Slow your name and company right down and PAUSE after it — half of our dead calls start with the tradie saying \"from where, sorry?\". Never open with \"do you remember me?\" — it makes them say no before you've said anything.",
    openerLine: "\"Hey [name], it's Bede... from Odin Digital. [pause] Did I catch you mid-job, or have you got 30 seconds?\"",
    bigMistake: "Sounding scripted, rushing the name, and spending the first 30 seconds on memory-lane instead of a reason to talk.",
    good: "You sound like a human, the name lands first time, and the call gets past the 2-minute mark — 93% of everything we've ever booked cleared 2 minutes.",
    askSeverity: "Lenient",
    askNote: "Booking is a bonus here. Earn it with 2-3 minutes of real conversation first — an ask before that is a flag, and getting blown out in 15 seconds is an opener problem, not an ask problem.",
  },
  {
    key: "cold_follow_up",
    label: "Cold follow-up",
    icon: PhoneForwarded,
    who: "We've spoken before and they said call back. There's context — use it.",
    opener: "Reference the previous conversation in the first sentence, and know your CRM notes before you dial.",
    openerLine: "\"Hey [name], it's Bede from Odin Digital — we spoke a couple of weeks back about [X], you said to touch base around now. Still a good time?\"",
    bigMistake: "Running the cold opener from scratch. \"Who is this?\" on a follow-up call means you threw away the warmth you'd already earned.",
    good: "You pick up the thread mid-conversation. They feel followed up with, not cold called.",
    askSeverity: "Moderate",
    askNote: "They said call back, so be direct — a decent conversation with no booking ask is a flag.",
  },
  {
    key: "inbound_ad",
    label: "Inbound ad lead",
    icon: Megaphone,
    who: "They filled in an ad form asking for info. Highest intent in the stack — and speed is everything: within 5 minutes of the form is worth ~100x.",
    opener: "Reference the exact ad/form they filled in. You're responding, not interrupting.",
    openerLine: "\"Hey [name], saw you just filled in the form about [X] — I'm calling to get you sorted. What were you hoping to find out?\"",
    bigMistake: "Calling hours later with a generic cold opener, or over-qualifying a hand-raiser with 15 minutes of discovery. They asked for help — book them.",
    good: "Fast call, reference the form, one or two fit questions, straight to the calendar. Short and efficient.",
    askSeverity: "Strict",
    askNote: "No booking ask on an inbound lead is a serious flag. Match their intent with urgency.",
  },
  {
    key: "cold_email",
    label: "Cold email reply",
    icon: MailOpen,
    who: "They replied to our email. There's brand awareness and mild intent — the email is your bridge.",
    opener: "Reference the email in the first sentence so they connect the call to it.",
    openerLine: "\"Hey [name], saw your reply to the email about [X] — still looking into that?\"",
    bigMistake: "Opening like a cold call so they never connect you to the email they answered.",
    good: "Feels like a natural continuation of the email thread; confirm they're still looking, then move to booking.",
    askSeverity: "Moderate-strict",
    askNote: "They replied, so lean direct — but a vague reply earns you some latitude to qualify first.",
  },
  {
    key: "re_engagement",
    label: "Re-engagement",
    icon: RotateCcw,
    who: "No-shows and deposit-then-quiet. The warmest non-inbound leads we have — they already wanted this once.",
    opener: "Name the history head-on and ask directly what happened. Don't dance around it — they'll respect the directness.",
    openerLine: "\"Hey [name], you booked a call with us and didn't make it / you put down a deposit and things went quiet — I wanted to see where your head's at. Still on the radar, or has something changed?\"",
    bigMistake: "Treating it like a cold call (tells them you don't remember them) or being too soft to ask why they went quiet.",
    good: "You find out what actually changed, address it, and get them back on track — or get a clear no and close the loop.",
    askSeverity: "Strictest",
    askNote: "They already showed intent. Off the phone without a booking or a clear stated reason is a hard flag.",
  },
];

export function StreamsPlaybook() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Five streams, five different calls</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Grading a cold scraped call and an inbound ad lead with the same rubric coaches you into being worse, not
          better. The AI coach classifies every call's stream automatically and grades the booking ask harder the more
          intent the lead already showed. The meta-rule: match your process to the stream — long discovery on a
          hand-raiser or a 90-second book attempt on a first-touch cold call is a{" "}
          <span className="font-medium text-foreground">wrong-playbook</span> flag, regardless of how well you ran it.
        </p>
      </div>
      {STREAMS.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.key}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Icon className="h-4 w-4 text-primary" /> {s.label}
                <Badge variant="outline" className={cn("ml-auto text-[10px]", SEVERITY_STYLES[s.askSeverity])}>
                  Booking ask graded: {s.askSeverity}
                </Badge>
              </CardTitle>
              <CardDescription>{s.who}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="font-medium text-foreground">The opener:</span> <span className="text-muted-foreground">{s.opener}</span></p>
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs italic leading-relaxed">{s.openerLine}</p>
              <p><span className="font-medium text-foreground">The stream-specific mistake:</span> <span className="text-muted-foreground">{s.bigMistake}</span></p>
              <p><span className="font-medium text-foreground">What good looks like:</span> <span className="text-muted-foreground">{s.good}</span></p>
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">How the coach grades the ask:</span> {s.askNote}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
