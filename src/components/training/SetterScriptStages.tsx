import { ArrowDownUp, Layers3, Lock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * The setter script, organised into the four stages Bede runs: Connection,
 * Problem, Solution, Pitch.
 *
 * IMPORTANT: every line below is verbatim from the approved script document.
 * The STAGES are a reorganisation, not a rewrite — notably the pitch now sits
 * after discovery rather than before it. Do not change any wording without the
 * sales lead's sign-off. Where the call data disagrees with a scripted line,
 * that is flagged as a proposal, not applied.
 */

type Level = 1 | 2 | 3;

interface Beat {
  label: string;
  lines: string[];
  note?: string;
  /** 1 = run verbatim, 2 = allowed once certified, 3 = Bede only. */
  level: Level;
}

interface Stage {
  key: string;
  n: number;
  title: string;
  goal: string;
  exitWhen: string;
  beats: Beat[];
}

const STAGES: Stage[] = [
  {
    key: "connection",
    n: 1,
    title: "Connection",
    goal: "Get them talking, and get off the back foot. You are not selling anything in this stage.",
    exitWhen: "They have said something real about their business, unprompted.",
    beats: [
      {
        label: "The opener",
        level: 1,
        lines: [
          "Hey mate, this is _______ from Odin, how have you BEEN mate?",
          "That's the way — I reached out to you at the ass end of (3 months ago) around the advertising for (high value service). Do you remember speaking with me?",
        ],
        note:
          "Only use the second line on a lead we have actually called before — check the attempt count. See the data note below about saying the company name in full.",
      },
      {
        label: "If they don't remember",
        level: 1,
        lines: [
          "Ah fair enough mate, I often forget the name of my first born. (Don't remember what I had for lunch.)",
        ],
        note:
          "This turns up in 28% of the calls that went on to book. It is not a setback. Do not re-explain who you are.",
      },
      {
        label: "The pivot, then stop talking",
        level: 1,
        lines: [
          "Cool man, just had it in my calendar to reach back out and see how things have been — how's business? How's the marketing treating ya? (Pause)",
        ],
        note: "The pause is the script. In 28% of booked openings versus 4% of do-not-calls. Say it, then say nothing.",
      },
    ],
  },
  {
    key: "problem",
    n: 2,
    title: "Problem",
    goal: "Find one thing that is actually costing them, in their own words. One thing, not five.",
    exitWhen: "They have named a problem and you have written down their exact phrasing.",
    beats: [
      {
        label: "Open it up",
        level: 1,
        lines: [
          "Is the work pretty steady, or is it more up and down month to month?",
          "Are you on the tools yourself, or running it from the office these days?",
          "Have you had anyone run ads or SEO for you before — how did that go?",
        ],
        note:
          "Pick ONE that fits what they just said. Running all three is an interrogation. The full hook list with call counts is in the Finding the Pain module.",
      },
      {
        label: "Then wait",
        level: 1,
        lines: ["(Say nothing. Let it sit.)"],
        note:
          "The most common coaching note across the reviewed calls is a good question ruined by the rep answering it themselves. Ask, then wait.",
      },
      {
        label: "Go one layer deeper — certified only",
        level: 2,
        lines: [
          "In an ideal world, would you be on the tools or off the tools?",
          "Is it the work you actually want, or is it just whatever comes in?",
          "What would be the first thing you'd want to fix?",
        ],
        note:
          "A second question only once the first has been genuinely answered. Stacking these while they are still thinking kills the stage.",
      },
      {
        label: "Free-form diagnosis — Bede only",
        level: 3,
        lines: [
          "Scale-of-1-to-10 priority framing, gap maths, the why under the revenue goal, business-versus-lifestyle fork.",
        ],
        note:
          "These need context you do not have on a first call, and twenty minutes you do not have either. They are listed so you recognise them on the recordings, not so you use them.",
      },
    ],
  },
  {
    key: "solution",
    n: 3,
    title: "Solution",
    goal: "Get them to agree, in principle, that the problem is worth solving. Before you have offered anything.",
    exitWhen: "They agree it would be worth a look. That agreement is what earns the pitch.",
    beats: [
      {
        label: "The in-principle agreement",
        level: 1,
        lines: [
          "At the end of the day, if there was more of the right type of work out there it's worth having a look at, right? (Pause)",
        ],
        note:
          "This is the hinge of the whole call. You are not asking them to buy, you are asking them to agree that more of the right work is good. Almost nobody says no, and their yes is what makes the pitch welcome instead of intrusive.",
      },
      {
        label: "If they lean on word of mouth",
        level: 1,
        lines: [
          "Last time I checked, word of mouth isn't scalable?",
          "People stop talking — do you have anything in place to future-proof the pipeline so you don't get caught out?",
          "Mate, I am sure if there are ways to future-proof the pipeline, you wouldn't be against that?",
        ],
      },
      {
        label: "If they're flat out",
        level: 2,
        lines: ["What's the calendar looking like?"],
        note: "Busy is not the same as satisfied. Flat-out prospects book at 1.6x baseline.",
      },
    ],
  },
  {
    key: "pitch",
    n: 4,
    title: "Pitch",
    goal: "Trade fifteen minutes for a blueprint. Book the specific time and lock the commitment.",
    exitWhen: "A specific day and time, an email address, and a firm verbal yes to showing up.",
    beats: [
      {
        label: "The pitch",
        level: 1,
        lines: [
          "Cool man, well the main reason I was reaching out to you today in particular is we have had great success working with XYZ and XYZ, and we actually have some recent, really cool results for your industry. (Pause)",
          "These are the same systems we have used to generate $400 million in client results — and look, at the end of the day, if there was more of the right type of work out there it's worth having a look at, right? (Pause)",
        ],
        note: "See the flag below on the $400 million line before you use it.",
      },
      {
        label: "The ask",
        level: 1,
        lines: [
          "All I need from ya is 10–15 on Google Meet to see how this system would work for your business. If we aren't a good fit, you'll walk away with a Blueprint on how to get more of the right type of work by using the system yourself. Sound fair enough?",
          "Perfect — I will show you what is working for our guys in your industry, what they spend, what they make, and also have a bit of a look at what you're currently doing and how the system would work for you.",
        ],
      },
      {
        label: "Pre-qualify while you pull up the calendar",
        level: 1,
        lines: [
          "Before we lock in a time, I just have a few quick questions to make sure we can maximise the value of your session with our team:",
          "How many extra (profitable work) could you take on per week?",
          "How many, if any, workers do you have?",
          "Are there other jobs that are more profitable and that you'd like more of?",
        ],
        note: "Make notes. These answers are what Bede opens the meeting with.",
      },
      {
        label: "Harder pre-qualify — certified only",
        level: 2,
        lines: [
          "Just so I'm not wasting your time — we don't work with everyone. Usually we're working with guys who have at least one or two others on the tools with them, and who are actively looking to grow or restructure how they bring in work.",
          "What's your team look like right now — just you, or a couple of others as well?",
          "And if something made sense — strategy-wise — would you actually be in a position to invest and act on it? Or would it be something you're planning for later down the track?",
        ],
        note: "Option 2 in the original script. It disqualifies harder and needs a steadier hand. Earn it first.",
      },
      {
        label: "Book it",
        level: 1,
        lines: [
          "Sweet thanks, appreciate your honesty — based on what you've said, I think you will definitely take a lot from the session.",
          "Alright, what would be the best email to send the session invite to? … Sweet thanks.",
          "Would (insert date/time option) work for you?",
          "If no: OK, what would be better for you then — morning or arvo?",
        ],
      },
      {
        label: "Lock the commitment",
        level: 1,
        lines: [
          "Alright mate, before I let you go, I just want to make sure we're on the same page.",
          "[Closer's name]'s calendar is packed. For each strategy call he has to take time to review your competitors and make sure he's prepared. So each week he looks at who booked slots in his calendar, and he can get a bit cranky if I have booked a bunch of meetings for blokes who don't show up.",
          "Can I count on you to be there? (Wait for a firm \"Yes\")",
          "Sweet. Now, I know life gets busy — jobs run over, things come up. What's the most likely thing that could get in the way of you making this call?",
          "Okay, I hear you. Look, if something does come up — and I get it, it happens — can you do me a favour and just shoot me a text to let me know instead of just not showing up? That way I can let [Closer's name] know and we can reschedule. Fair?",
          "Legend. Appreciate that, mate.",
        ],
        note: "Do not skip this because the booking already felt good. This is the no-show insurance.",
      },
      {
        label: "Close out",
        level: 1,
        lines: [
          "Sweet, I'll get you booked in for … (designated time and day).",
          "You can expect some emails with a bit more information around what we do, and you'll get some reminders about the meeting. If something comes up and you can't make it, please just flick me a text and I will reschedule you.",
        ],
      },
    ],
  },
];

const LEVELS: { level: Level; name: string; who: string; rule: string; cls: string }[] = [
  {
    level: 1,
    name: "Level 1 — run it verbatim",
    who: "Everyone, until certified",
    rule:
      "Word for word, in order, including the pauses. You do not get to judge which lines are unnecessary until you have run it enough times to know what each one is doing.",
    cls: "border-emerald-500/40 bg-emerald-500/5",
  },
  {
    level: 2,
    name: "Level 2 — allowed variations",
    who: "Once certified by the sales lead",
    rule:
      "Deeper problem questions, the harder pre-qualify, choosing your own order within a stage. Still every stage, still in stage order.",
    cls: "border-sky-500/40 bg-sky-500/5",
  },
  {
    level: 3,
    name: "Level 3 — free-form",
    who: "Bede only",
    rule:
      "Stages get merged or skipped entirely, including the pitch. This works because he is carrying the client history, the numbers and the relationship in his head. Without those, the same call is just a rambling one.",
    cls: "border-destructive/40 bg-destructive/5",
  },
];

const LEVEL_BADGE: Record<Level, { label: string; cls: string }> = {
  1: { label: "L1 verbatim", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  2: { label: "L2 certified", cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  3: { label: "L3 Bede only", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
};

export function SetterScriptStages() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">The script, in four stages</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Connection, Problem, Solution, Pitch. Every line is verbatim from the approved script — the stages are how
          you run it, not new wording. Each stage has a goal and a condition for moving on. Do not advance a stage
          because you have said the words; advance because the condition is met.
        </p>
      </div>

      <PanelSection
        icon={Layers3}
        title="Three levels, and why Bede's calls don't match the script"
        description="Read this first. It is the thing most new setters get wrong after listening to the recordings."
      >
        <div className="space-y-2">
          {LEVELS.map((l) => (
            <div key={l.level} className={`rounded-lg border p-3 ${l.cls}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{l.name}</span>
                <Badge variant="outline" className="border-border font-mono text-[9px] uppercase">{l.who}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{l.rule}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-sm font-medium">You will listen to Bede's calls and notice he ignores this script</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            He does, and that is not permission. He is running Level 3 off years of context — he knows the client
            results, the numbers, the trade, and often the person. Improvising without that underneath is not nuance,
            it is just an unstructured call. Run Level 1 until the sales lead signs you off.
          </p>
        </div>
      </PanelSection>

      {STAGES.map((stage) => (
        <PanelSection
          key={stage.key}
          icon={ArrowDownUp}
          title={`Stage ${stage.n} — ${stage.title}`}
          description={stage.goal}
        >
          <div className="mb-3 flex flex-wrap items-baseline gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-primary">Move on when</span>
            <span className="text-sm">{stage.exitWhen}</span>
          </div>
          <div className="space-y-2">
            {stage.beats.map((beat) => {
              const b = LEVEL_BADGE[beat.level];
              return (
                <div
                  key={beat.label}
                  className={`rounded-lg border p-3 ${
                    beat.level === 3 ? "border-destructive/25 bg-destructive/[0.03]" : "border-border bg-card"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`font-mono text-[9px] uppercase ${b.cls}`}>{b.label}</Badge>
                    <span className="text-sm font-semibold">{beat.label}</span>
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {beat.lines.map((line, i) => (
                      <p key={i} className="text-sm leading-relaxed">{line}</p>
                    ))}
                  </div>
                  {beat.note && <p className="mt-1.5 text-xs italic text-muted-foreground">{beat.note}</p>}
                </div>
              );
            })}
          </div>
        </PanelSection>
      ))}

      <PanelSection
        icon={TriangleAlert}
        title="Two things in this script that need the sales lead's decision"
        description="Flagged rather than changed. Neither has been edited."
      >
        <div className="space-y-2">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
            <p className="text-sm font-medium">The opener says "from Odin". The data says say it in full.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Across 436 recorded cold calls, the opening contains "Odin Digital" intact 24 times and all 24 booked. The
              scripted line is "this is _______ from Odin". Proposal: change it to "from Odin Digital". Not applied
              without sign-off.
            </p>
          </div>
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
            <p className="text-sm font-medium">The "$400 million in client results" line.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The Tradie Talk module's rule is: does a screenshot exist? If this number cannot be evidenced on request,
              it is the kind of claim that costs a deal at contract stage. It is in the approved script, so it stays
              here until the sales lead rules on it — but do not volunteer it as a specific if a prospect pushes back
              on where it came from.
            </p>
          </div>
        </div>
      </PanelSection>

      <PanelSection
        icon={Lock}
        title="What certification actually means"
        description="So Level 2 is a decision, not a drift."
      >
        <div className="space-y-1.5 text-sm">
          <p className="text-muted-foreground">
            You are signed off to Level 2 when the sales lead has reviewed your calls and agrees you are running all
            four stages cleanly — not when you feel ready, and not when you have hit a booking number. A call can book
            for the wrong reasons; the standard is clean process.
          </p>
          <p className="text-muted-foreground">
            Submit your own reviews from the Training page. Self-review first, then send it up. The stages above are the
            thing being graded.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
