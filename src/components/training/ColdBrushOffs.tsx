import { Ban, MessageCircleOff, Repeat2, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * Cold-call brush-offs, counted across 436 of our own recorded cold dials
 * (>=15s talk time, prospect audible). 29 of those booked, so the baseline
 * book rate is 6.7% — that is the number every row below is judged against.
 *
 * A brush-off is NOT a sales objection. It arrives in the first twenty seconds,
 * before the prospect knows what you do, and it is mostly reflex. The objection
 * bank is a different tool for a different moment.
 */

interface BrushOff {
  said: string;
  calls: number;
  share: string;
  bookRate: number;
  signal: "strong" | "warm" | "flat" | "hard" | "dq";
  reality: string;
  move: string;
}

/** Ordered by how often you will hear it, not by how promising it is. */
const BRUSH_OFFS: BrushOff[] = [
  {
    said: '"I\'m all good at the moment"',
    calls: 290,
    share: "67% of calls",
    bookRate: 6,
    signal: "flat",
    reality:
      "The default reflex. Books at exactly the baseline rate, which means it carries almost no information — it is what people say to get off the phone before they have heard anything.",
    move:
      'Do not accept it and do not argue. Agree, then ask a binary diagnostic: "Fair enough. Is that because you\'re flat out as it is, or you\'re just not looking to grow at the minute?" It forces a real answer instead of a reflex.',
  },
  {
    said: '"I\'m flat out" / "I\'ve got plenty on"',
    calls: 95,
    share: "22% of calls",
    bookRate: 11,
    signal: "warm",
    reality:
      "Better than it sounds — books at 1.6x baseline. Busy is not the same as satisfied. Plenty of them are flat out on work they resent: subbie rates, builders' jobs, tiny call-outs.",
    move:
      'Go at the composition of the work, not the volume: "Good problem to have. Is it the work you actually want, or is it whatever comes in?" That question is what opens the pain.',
  },
  {
    said: '"Not interested"',
    calls: 51,
    share: "12% of calls",
    bookRate: 2,
    signal: "hard",
    reality:
      "The one genuine stop on this page. Books at 2%, roughly a third of baseline. When someone says the actual words, the call is usually over.",
    move:
      'One light attempt, then leave cleanly: "No worries. Is it just because you\'ve got someone doing it already?" If the second no arrives, thank them and move on. Grinding these costs you the dials that pay.',
  },
  {
    said: '"Can you call me back?" / "I\'m on a job"',
    calls: 44,
    share: "10% of calls",
    bookRate: 11,
    signal: "warm",
    reality:
      "Usually literal, not a dodge. Books at 1.6x baseline. A tradie mid-job genuinely cannot talk and will often take the call later.",
    move:
      "Do not pitch into it. Get a specific time, not \"later\" — \"No stress. Are you better first thing tomorrow or after four?\" Then set the follow-up in the dialer before you hang up, or it will not happen.",
  },
  {
    said: '"We\'ve already got someone doing it"',
    calls: 21,
    share: "5% of calls",
    bookRate: 29,
    signal: "strong",
    reality:
      "The best signal on the board at 4.3x baseline, and the one most new setters throw away. Someone already paying an agency has proven they will spend money on growth. That is warmer than a cold lead, not colder.",
    move:
      'Never compete on being better. Get curious about the incumbent: "Good to hear. How long have they been running it for you, and are you actually seeing the jobs come through?" The complaint usually arrives on its own.',
  },
  {
    said: '"Send me an email"',
    calls: 12,
    share: "3% of calls",
    bookRate: 17,
    signal: "warm",
    reality:
      "Books at 2.5x baseline on a small sample (n=12), so treat it as a hint. It is a soft exit, but a soft exit means they did not want a fight.",
    move:
      'Agree, then keep the conversation: "Yeah, happy to. What\'s the best address? And while I\'ve got you — how are you finding the work at the moment?" The email is the price of another thirty seconds.',
  },
  {
    said: '"I get a hundred of you blokes a day"',
    calls: 10,
    share: "2% of calls",
    bookRate: 20,
    signal: "warm",
    reality:
      "Small sample (n=10), but books above baseline. It is a complaint about the other callers, not about you.",
    move:
      'Side with them. Bede\'s line, and it works: "We get enough of them ourselves, to be honest. I don\'t know why we do it either." Then ask your question. Being the one caller who did not plough on is the differentiator.',
  },
  {
    said: '"I\'m retired" / "I sold the business"',
    calls: 7,
    share: "2% of calls",
    bookRate: 0,
    signal: "dq",
    reality: "Zero bookings. This is a real disqualifier, not a brush-off.",
    move:
      "Mark the contact so nobody rings them again. This is one of only two legitimate DQ reasons — check the Definitions tab if you are unsure which to use.",
  },
  {
    said: '"Not in a position" / "Bit tight at the moment"',
    calls: 4,
    share: "1% of calls",
    bookRate: 0,
    signal: "dq",
    reality:
      "Zero bookings, but only 4 calls — that is not enough to conclude anything. Treat it as unknown rather than dead.",
    move:
      "Worth one question about timing rather than money: \"Is it a now thing or a never thing?\" If there is a date, set the follow-up. Do not discuss price — that is not your call to have.",
  },
];

const SIGNAL_STYLES: Record<BrushOff["signal"], { label: string; cls: string }> = {
  strong: { label: "best signal", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  warm: { label: "above baseline", cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  flat: { label: "no signal", cls: "border-border bg-muted/50 text-muted-foreground" },
  hard: { label: "real stop", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  dq: { label: "disqualify", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
};

const RECOVERY_MOVES: { move: string; line: string; why: string }[] = [
  {
    move: "Agree, then binary diagnostic",
    line: '"Fair enough. Is that because you\'re flat out as it is, or you\'re just not looking to grow at the minute?"',
    why:
      "The highest-yield recovery in the recordings. A two-option question is much harder to answer with a reflex than an open one, and either answer gives you somewhere to go.",
  },
  {
    move: "Side with them about cold callers",
    line: '"We get enough of them ourselves, to be honest. I don\'t know why we do it either."',
    why: "Disarms the irritation instead of absorbing it. Repeatedly bought another beat on calls that had already gone flat.",
  },
  {
    move: "Self-deprecate on the memory",
    line: '"I hardly remember what I had for breakfast, let alone a phone call."',
    why: "Appears in the booked calls after \"I don't remember you\". Costs nothing and stops you defending the call.",
  },
  {
    move: "Agree with their good news, then ask",
    line: '"Good on you. How\'s it all going at the moment?"',
    why: "When they say they are busy or doing well, agreeing and asking opens more than any counter-argument.",
  },
  {
    move: "Get curious about a disqualifier",
    line: '"Oh, that\'s alright. How come you stopped running it?"',
    why: "Two calls that looked dead re-opened on this. Sometimes the business is still there in another form, or there is a referral in it.",
  },
];

export function ColdBrushOffs() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Brush-offs, ranked by how often you will hear them</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          From 436 of our own recorded cold dials, 29 of which booked. The baseline book rate is{" "}
          <span className="font-medium text-foreground">6.7%</span> — every row is judged against that. A brush-off is
          not a sales objection: it arrives in the first twenty seconds, before they know what you do, and it is
          mostly reflex.
        </p>
      </div>

      <PanelSection
        icon={MessageCircleOff}
        title="The nine you will actually hear"
        description="Book rate is the share of calls containing that phrase which still ended in a booked meeting."
      >
        <div className="space-y-2.5">
          {BRUSH_OFFS.map((b) => {
            const s = SIGNAL_STYLES[b.signal];
            return (
              <div key={b.said} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{b.said}</span>
                  <Badge variant="outline" className={`font-mono text-[9px] uppercase ${s.cls}`}>{s.label}</Badge>
                  <span className="ml-auto flex items-baseline gap-2 font-mono text-[11px] text-muted-foreground">
                    <span>{b.share}</span>
                    <span className={b.bookRate >= 11 ? "text-emerald-600 dark:text-emerald-400" : b.bookRate <= 2 ? "text-destructive" : ""}>
                      {b.bookRate}% book
                    </span>
                    <span className="opacity-60">n={b.calls}</span>
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{b.reality}</p>
                <p className="mt-1.5 border-l-2 border-primary/50 pl-2 text-sm">{b.move}</p>
              </div>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection
        icon={TrendingUp}
        title="The counterintuitive one"
        description="If you remember one row from the table, make it this."
      >
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <p>
            <span className="font-semibold">"We've already got someone doing it" books at 29% — over four times
            baseline.</span>{" "}
            Most setters hear it as a wall and end the call. It is the strongest buying signal in the dataset, because
            it tells you they already spend money on growth and have an opinion about how it is going.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Sample is 21 calls, so it is a strong hint rather than a settled fact. Do not compete on being better than
            the incumbent — ask how the incumbent is actually going and let them tell you.
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={Repeat2}
        title="Five recovery moves"
        description="Lines from the recordings that re-opened calls which had already gone flat."
      >
        <div className="space-y-2">
          {RECOVERY_MOVES.map((r) => (
            <div key={r.move} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] font-mono uppercase tracking-widest text-primary">{r.move}</p>
              <p className="mt-0.5 text-sm font-medium">{r.line}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{r.why}</p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={Ban}
        title="When to stop"
        description="Knowing when to leave is a skill, not a failure of nerve."
      >
        <div className="space-y-1.5 text-sm">
          <p>
            <span className="font-medium">Two nos and out.</span>{" "}
            <span className="text-muted-foreground">
              One recovery attempt is right. A second is rarely worth it and a third never is. "Not interested" books
              at 2% — the dials you spend grinding that are dials you are not spending on the pool that books at 29%.
            </span>
          </p>
          <p>
            <span className="font-medium">Leave the door open, always.</span>{" "}
            <span className="text-muted-foreground">
              Thank them and go. Several of our booked meetings are re-dials of people who said no the first time. A
              rude exit is the one thing that makes a lead permanently worthless.
            </span>
          </p>
          <p>
            <span className="font-medium">Log what they actually said.</span>{" "}
            <span className="text-muted-foreground">
              The reason this page exists is that 436 calls got recorded and counted. Your dispositions and notes are
              what makes the next version of it better.
            </span>
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
