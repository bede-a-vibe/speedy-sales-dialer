import { CircleCheck, ListChecks, Lock, PhoneCall, TriangleAlert, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";
import { STAGE_EXIT_REASONS, EXIT_STAGE_LABELS, type ExitStageKey } from "@/lib/funnelMetrics";

/**
 * THE SCRIPT — and the four stage checkboxes it drives.
 *
 * Level 1 is what a setter runs from day one, in the sales lead's order:
 * Opener (with mini discovery), Pitch, Appointment Setting, Ending Call.
 *
 * The script is NOT reordered to match the tracker. It does not need to be —
 * the linear script already passes every gate in tracker order. The gates are
 * embedded inside the blocks rather than being blocks of their own, and the
 * Pitch block carries TWO of them. Each gate line below is tagged with the
 * checkbox it earns, so the rep ticks as they go instead of guessing at the end.
 *
 * Checkbox columns on call_logs: reached_connection, reached_problem_awareness,
 * reached_solution_awareness, reached_commitment. "Booked" is the outcome, not
 * a checkbox.
 *
 * Do not reword any script line without the sales lead's sign-off.
 */

type Gate = "connected" | "problem" | "solution" | "commitment" | "booked";

const GATES: Record<Gate, { label: string; cls: string; exitKey: ExitStageKey | null }> = {
  connected: { label: "Connected", cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300", exitKey: "connection" },
  problem: { label: "Problem", cls: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300", exitKey: "problem" },
  solution: { label: "Solution", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", exitKey: "solution" },
  commitment: { label: "Commitment", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", exitKey: "commitment" },
  booked: { label: "Booked", cls: "border-primary/40 bg-primary/10 text-primary", exitKey: "booking" },
};

/** What earns each tick. This is the bit reps get wrong. */
const TICK_RULES: { gate: Gate; earnedBy: string; tickWhen: string; notWhen: string }[] = [
  {
    gate: "connected",
    earnedBy: '"how\'s business? How\'s the marketing treating ya?"',
    tickWhen: "They answered it. A real reply about their business, past about fifteen seconds of talking.",
    notWhen: "They picked up. Picking up is not connecting.",
  },
  {
    gate: "problem",
    earnedBy: "The mini discovery that follows",
    tickWhen: "They named something themselves — quiet patch, bad agency, too much on, no idea where jobs come from.",
    notWhen: "You described a problem and they went \"yeah\". You naming it does not count.",
  },
  {
    gate: "solution",
    earnedBy: '"...it\'s worth having a look at right?"',
    tickWhen: "They agreed it is worth a look. That agreement is the gate, and it is why the pause is in the script.",
    notWhen: "You said the line and kept talking. No answer, no tick.",
  },
  {
    gate: "commitment",
    earnedBy: '"Sound fair enough?"',
    tickWhen: "A verbal yes to the 10-15 minutes, before any date is discussed.",
    notWhen: "They have not objected. Silence is not a yes.",
  },
  {
    gate: "booked",
    earnedBy: "Appointment setting",
    tickWhen: "Specific day, specific time, email captured. This one is the call outcome, not a checkbox.",
    notWhen: "\"Sometime next week\" or \"flick me an email and we'll sort it\".",
  },
];

interface Line {
  text: string;
  gate?: Gate;
}

interface Block {
  label: string;
  lines: Line[];
  note?: string;
}

/** Level 1. The whole job on day one, in the sales lead's order. */
const CORE: { n: number; title: string; blocks: Block[] }[] = [
  {
    n: 1,
    title: "Opener",
    blocks: [
      {
        label: "The opener",
        lines: [
          { text: "Hey mate, this is _______ from Odin, how have you BEEN mate?" },
          { text: "That's the way, I reached out to you at the ass end of (3 months ago) around the advertising for (High Value service), do you remember speaking with me?" },
        ],
        note: "Say your name and the company clearly and unhurried — about a third of prospects ask again regardless. Module 3 covers why that is normal and not a bad sign.",
      },
      {
        label: "If no",
        lines: [
          { text: "Ah fair enough mate, I often forget the name of my first born. (Don't remember what I had for lunch.)" },
          { text: "Cool man, just had it in my calendar to reach back out and see how things have been, how's business? How's the marketing treating ya? (Pause)", gate: "connected" },
        ],
        note: "Then mini discovery — let them talk. The pause is part of the script.",
      },
      {
        label: "Mini discovery",
        lines: [
          { text: "(Let them talk. Whatever they raise is the thing the meeting is about.)", gate: "problem" },
        ],
        note: "Write down their exact phrasing. If they say \"up and down\", the meeting is about it being up and down — do not translate it into agency language.",
      },
    ],
  },
  {
    n: 2,
    title: "Pitch",
    blocks: [
      {
        label: "The pitch",
        lines: [
          { text: "Cool man, well the main reason I was reaching out to you today in particular is we have had great success working with XYZ and XYZ, and we actually have some recent, really cool results for your industry. (Pause)" },
          { text: "These are the same systems we have used to generate $400 million in client results and look at the end of the day if there was more of the right type of work out there it's worth having a look at right? (Pause)", gate: "solution" },
          { text: "All I need from ya is 10-15 on Google Meet to see how this system would work for your business. If we aren't a good fit, you'll walk away with a Blueprint on how to get more of the right type of Work by using the system yourself. Sound Fair Enough?", gate: "commitment" },
          { text: "Perfect, I will show you what is working for Our Guys in your industry, what they spend, what they make and also have a bit of a look at what you're currently doing and how the system would work for you." },
        ],
        note: "This one block carries two of the four checkboxes. Both are questions, and both need an actual answer before you tick. That is what the pauses are for.",
      },
    ],
  },
  {
    n: 3,
    title: "Appointment setting",
    blocks: [
      {
        label: "Lock the time",
        lines: [
          { text: "Sweet thanks, appreciate your honesty — based on what you've said, I think you will definitely take a lot from the Session." },
          { text: "Alright what would be the best email to send the session invite to? ………… Sweet thanks." },
          { text: "Would (insert date/time option) work for you?", gate: "booked" },
        ],
      },
      {
        label: "If they say no",
        lines: [
          { text: "Ok, what would be better for you then, morning or arvo?" },
          { text: "Then find the next closest available day with a time that they're available." },
        ],
        note: "Never leave with \"sometime next week\". A specific day and time or it is not a booking.",
      },
    ],
  },
  {
    n: 4,
    title: "Ending the call",
    blocks: [
      {
        label: "Wrap up",
        lines: [
          { text: "Sweet I'll get you booked in for ….. (designated time and day)." },
          { text: "You can expect some emails with a bit more information around what we do and you'll get some reminders about the meeting. If something comes up and you can't make it please just flick me a text and I will reschedule you." },
        ],
      },
    ],
  },
];

interface Unlockable {
  order: number;
  name: string;
  when: string;
  why: string;
  blocks: Block[];
  bedeOnly?: boolean;
}

const UNLOCKS: Unlockable[] = [
  {
    order: 1,
    name: "Pre-qualifying questions",
    when: "Once you are booking consistently and the four blocks feel automatic.",
    why:
      "Makes the booking better rather than more frequent. It gives the closer something to walk in with, and it filters out meetings that were never going to go anywhere. Slot it in after the pitch, before you ask for the email — it does not change any checkbox.",
    blocks: [
      {
        label: "Option 1 — the softer version",
        note: "Make notes and pull up the calendar while asking.",
        lines: [
          { text: "Before we lock in a time, I just have a few quick questions to make sure we can maximise the value of your session with our team:" },
          { text: "How many extra (profitable work) could you take on per week?" },
          { text: "How many, if any, workers do you have?" },
          { text: "Are there other jobs that are more profitable and that you'd like more of?" },
        ],
      },
      {
        label: "Option 2 — the harder version",
        note: "Disqualifies harder and needs a steadier hand. Use Option 1 until you are comfortable.",
        lines: [
          { text: "Just so I'm not wasting your time — we don't work with everyone. Usually we're working with guys who have at least one or two others on the tools with them, and who are actively looking to grow or restructure how they bring in work." },
          { text: "What's your team look like right now — just you, or a couple of others as well?" },
          { text: "And if something made sense — strategy-wise — would you actually be in a position to invest and act on it? Or would it be something you're planning for later down the track?" },
        ],
      },
    ],
  },
  {
    order: 2,
    name: "Commitment lock-in",
    when: "Once you are booking consistently and want the ones you book to actually turn up.",
    why:
      "No-show insurance. It does not win you more bookings, it protects the ones you have. Add it after the time is locked, before you close out.",
    blocks: [
      {
        label: "Stronger commitment",
        lines: [
          { text: "Alright mate, before I let you go, I just want to make sure we're on the same page." },
          { text: "[Closer's name]'s calendar is packed. For each strategy call he has to take time to review your competitors and make sure he's prepared. So each week he looks at who booked slots in his calendar, and he can get a bit cranky if I have booked a bunch of meetings for blokes who don't show up." },
          { text: "Can I count on you to be there? (Wait for a firm \"Yes\")" },
          { text: "Sweet. Now, I know life gets busy — jobs run over, things come up. What's the most likely thing that could get in the way of you making this call?" },
          { text: "Okay, I hear you. Look, if something does come up — and I get it, it happens — can you do me a favour and just shoot me a text to let me know instead of just not showing up? That way I can let [Closer's name] know and we can reschedule. Fair?" },
          { text: "Legend. Appreciate that, mate." },
        ],
      },
    ],
  },
  {
    order: 3,
    name: "Deeper discovery before the pitch",
    when: "Once the sales lead signs you off. Not before.",
    why:
      "Expanding the mini discovery into real problem and solution work, so the prospect has named something that hurts before you pitch anything. Same four checkboxes, earned earlier and more solidly. It converts better done well and much worse done clumsily, which is why it is not where you start.",
    blocks: [
      {
        label: "Problem questions — one, then wait",
        lines: [
          { text: "Is the work pretty steady, or is it more up and down month to month?" },
          { text: "Are you on the tools yourself, or running it from the office these days?" },
          { text: "Have you had anyone run ads or SEO for you before — how did that go?" },
        ],
        note: "One question, not three. The full hook list with call counts is in Module 5.",
      },
      {
        label: "Getting them to want it solved",
        lines: [
          { text: "In an ideal world, would you be on the tools or off the tools?" },
          { text: "Is it the work you actually want, or is it just whatever comes in?" },
          { text: "What would be the first thing you'd want to fix?" },
        ],
        note: "Their answer here is what the pitch then speaks to, instead of the pitch being generic.",
      },
    ],
  },
  {
    order: 4,
    name: "Free-form",
    when: "Bede only.",
    bedeOnly: true,
    why:
      "Blocks get merged or dropped entirely, including the pitch. This works because he is carrying the client results, the numbers, the trade and often the person in his head. Improvising without those underneath is not nuance, it is just an unstructured call.",
    blocks: [],
  },
];

function LineRow({ line }: { line: Line }) {
  const g = line.gate ? GATES[line.gate] : null;
  return (
    <div className={g ? "rounded-md border border-border bg-background/70 px-2 py-1.5" : undefined}>
      {g && (
        <Badge variant="outline" className={`mb-1 font-mono text-[9px] uppercase ${g.cls}`}>
          ✓ tick {g.label}
        </Badge>
      )}
      <p className="text-sm leading-relaxed">{line.text}</p>
    </div>
  );
}

export function SetterScript() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Run these four blocks. That is the whole call.</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Opener, pitch, appointment setting, ending. In that order, word for word, including the pauses. The four stage
          checkboxes in the dialer are earned by specific lines inside these blocks — they are marked below. Tick them
          as you go, while the call is live. Reconstructing them afterwards is guesswork and it poisons the funnel data
          everything else on this page is built from.
        </p>
      </div>

      <PanelSection
        icon={ListChecks}
        title="What earns each tick"
        description="The script already passes every gate in tracker order. You are not reordering anything — you are noticing when a gate is passed."
      >
        <div className="space-y-2">
          {TICK_RULES.map((t) => {
            const g = GATES[t.gate];
            return (
              <div key={t.gate} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`font-mono text-[9px] uppercase ${g.cls}`}>{g.label}</Badge>
                  <span className="text-sm font-medium">{t.earnedBy}</span>
                </div>
                <p className="mt-1 text-xs">
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">Tick when:</span>{" "}
                  <span className="text-muted-foreground">{t.tickWhen}</span>
                </p>
                <p className="mt-0.5 text-xs">
                  <span className="font-medium text-destructive">Not when:</span>{" "}
                  <span className="text-muted-foreground">{t.notWhen}</span>
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">The one to watch:</span> the Pitch block carries two
            checkboxes, not one. "Worth having a look at right?" earns Solution. "Sound fair enough?" earns Commitment.
            They are ten seconds apart and both need an actual answer. Ticking both because you said both lines is the
            most likely way this data goes wrong.
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={PhoneCall}
        title="Level 1 — the script"
        description="Verbatim. Do not improvise, do not reorder, do not decide a line is unnecessary until you have run it enough to know what it is doing."
      >
        <div className="space-y-2.5">
          {CORE.map((section) => (
            <div key={section.n} className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-3">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[9px] uppercase text-emerald-700 dark:text-emerald-300">
                  {section.n}
                </Badge>
                <span className="text-sm font-semibold">{section.title}</span>
              </div>
              <div className="space-y-3">
                {section.blocks.map((b) => (
                  <div key={b.label}>
                    <p className="mb-1 text-xs font-semibold text-foreground">{b.label}</p>
                    <div className="space-y-1.5">
                      {b.lines.map((line, i) => <LineRow key={i} line={line} />)}
                    </div>
                    {b.note && <p className="mt-1 text-xs italic text-muted-foreground">{b.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            If a prospect throws something the script does not cover, that is what Module 2 is for. Handle it, then come
            straight back to whichever block you were in. Do not abandon the script because the call went sideways for
            ten seconds.
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={TriangleAlert}
        title="If the call dies, log where and why"
        description="The dialer asks for a reason at whichever stage you stopped. These are the options, so you can pick honestly instead of reaching for the nearest one."
      >
        <div className="space-y-2">
          {(["connection", "problem", "solution", "commitment", "booking"] as ExitStageKey[]).map((key) => (
            <div key={key} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-xs font-semibold">{EXIT_STAGE_LABELS[key]}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {STAGE_EXIT_REASONS[key]
                  .filter((o) => o.value !== "other")
                  .map((o) => (
                    <Badge key={o.value} variant="outline" className="border-border bg-muted/40 font-normal text-[11px]">
                      {o.label}
                    </Badge>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Pick the honest one, not the flattering one. "No pain acknowledged" and "deflected questions" mean different
          things and lead to different coaching. If none fit, use Other and write what actually happened in the notes
          box — that free text is where the next version of this playbook comes from.
        </p>
      </PanelSection>

      <PanelSection
        icon={Unlock}
        title="What you add next, and when"
        description="One at a time, in this order. Four blocks run cleanly beats seven run badly. None of these change the checkboxes."
      >
        <div className="space-y-2.5">
          {UNLOCKS.map((u) => (
            <div
              key={u.name}
              className={`rounded-lg border p-3 ${u.bedeOnly ? "border-destructive/30 bg-destructive/[0.03]" : "border-border bg-card"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    u.bedeOnly
                      ? "border-destructive/40 bg-destructive/10 font-mono text-[9px] uppercase text-destructive"
                      : "border-sky-500/40 bg-sky-500/10 font-mono text-[9px] uppercase text-sky-700 dark:text-sky-300"
                  }
                >
                  {u.bedeOnly ? "locked" : `add ${u.order}`}
                </Badge>
                <span className="text-sm font-semibold">{u.name}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{u.when}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{u.why}</p>
              {u.blocks.length > 0 && (
                <div className="mt-2 space-y-2.5 border-l-2 border-border pl-2.5">
                  {u.blocks.map((b) => (
                    <div key={b.label}>
                      <p className="mb-1 text-xs font-semibold text-foreground">{b.label}</p>
                      {b.note && <p className="mb-1 text-[11px] italic text-muted-foreground">{b.note}</p>}
                      <div className="space-y-1.5">
                        {b.lines.map((line, i) => (
                          <p key={i} className="text-sm leading-relaxed text-muted-foreground">{line.text}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={Lock}
        title="Why Bede's calls sound nothing like this"
        description="Read this before you listen to the recordings, or you will draw the wrong conclusion from them."
      >
        <div className="space-y-1.5 text-sm">
          <p className="text-muted-foreground">
            You will open the Winning Calls library, hear Bede skip the pitch entirely, ask questions that are not on
            this page, and conclude the script is optional. It is not. He is running the last level off years of context
            he has and you do not — what each client actually got, what the numbers were, what that trade cares about,
            and often the person on the other end.
          </p>
          <p className="text-muted-foreground">
            Listen to those calls for the <span className="font-medium text-foreground">tone</span>, not the structure.
            How he agrees before he redirects, how he never argues with the first thing out of their mouth, how little he
            talks in the first minute. That part transfers on day one. The improvisation does not.
          </p>
          <p className="pt-1 text-muted-foreground">
            You move up a level when the sales lead reviews your calls and says so — not when you feel ready, and not
            when you hit a booking number. A call can book for the wrong reasons, and the stage ticks are how we tell
            the difference.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
