import { Activity, Droplet, GitBranch, Megaphone, MoveHorizontal, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * Five problems. Every tradie you ring has at least one, and your whole job on
 * the call is working out which, in their words, and booking the meeting about
 * that specific one.
 *
 * Two of them are not what they look like: inconsistency usually arrives
 * bundled with two others, and the hiring problem is nearly always a money
 * problem wearing a hat.
 */

interface Problem {
  n: number;
  name: string;
  looksLike: string;
  sounds: string[];
  reallyIs: string;
  ask: string;
  book: string;
}

const PROBLEMS: Problem[] = [
  {
    n: 1,
    name: "Quality",
    looksLike:
      "Busy all week, full diary, and the revenue does not match the hours. They are working a full week for a number that does not make sense.",
    sounds: [
      "\"Busy but not making much\"",
      "\"Tap washes and light switches\"",
      "\"Everyone's price shopping\"",
      "\"Tyre kickers\"",
    ],
    reallyIs:
      "The work is coming in but it is the wrong work. They do not need more jobs, they need to swap the jobs they have for better ones. Often they are on hipages or similar, where the cheapest quote wins and the margin is gone before they arrive.",
    ask: '"Is it the work you actually want, or is it just whatever comes in?"',
    book: "The meeting is about changing the mix of work, not the amount. Say that back to them in their words.",
  },
  {
    n: 2,
    name: "Volume",
    looksLike:
      "Pricing is fine, the work they do get is good, there just is not enough of it. Gaps in the diary they cannot fill.",
    sounds: [
      "\"Need more work\"",
      "\"Phone's not ringing\"",
      "\"Got the guys sitting around\"",
      "\"I could take on more tomorrow\"",
    ],
    reallyIs:
      "The straightforward one, and the only one where more leads is genuinely the answer. Rarer than you would expect — most of them are not short of work, they are short of the right work.",
    ask: '"How much more could you actually take on next week if it turned up?"',
    book: "The meeting is about turning the tap on. This is the only problem where you can safely talk about volume.",
  },
  {
    n: 3,
    name: "Inconsistency",
    looksLike:
      "Yo-yo. Flat out one fortnight, dead the next. Cannot plan, cannot hire, cannot forecast. No idea where the work comes from.",
    sounds: [
      "\"Up and down\"",
      "\"Ebbs and flows\"",
      "\"Feast or famine\"",
      "\"Booked till Thursday, nothing next week\"",
      "\"Word of mouth\"",
    ],
    reallyIs:
      "The most common of the five, and it almost never travels alone. See the word-of-mouth section below — this one is usually three problems in a trench coat.",
    ask: '"Is the work pretty steady, or is it more up and down month to month?"',
    book: "The meeting is about knowing what next month looks like. Use their word — if they said up and down, the meeting is about it being up and down.",
  },
  {
    n: 4,
    name: "Capacity",
    looksLike:
      "Genuinely full. Turning work away or pushing jobs out weeks. Wants another set of hands.",
    sounds: [
      "\"Flat out\"",
      "\"Can't fit anyone in till next month\"",
      "\"Need another bloke\"",
      "\"Turning work away\"",
    ],
    reallyIs:
      "Sometimes exactly what it says, and those are a real no for now — do not pretend otherwise, just leave the door open. But check it against problem 5 first, because most people who say they need to hire cannot actually afford to.",
    ask: '"If the phone did ring more tomorrow, have you got the capacity to take it on?"',
    book: "If they are truly full, this is a later conversation. Mark it honestly and set a follow-up rather than forcing a meeting.",
  },
  {
    n: 5,
    name: "The hiring problem that is not a hiring problem",
    looksLike:
      "\"I need another bloke but I can't find anyone good.\" Sounds like a labour-market complaint. Almost never is.",
    sounds: [
      "\"Can't get good people\"",
      "\"Everyone wants too much money\"",
      "\"I've had three apprentices and none of them stuck\"",
      "\"I'd hire if I could afford it\"",
    ],
    reallyIs:
      "Follow the chain. They cannot pay what a good tradie costs, because the margin is not there, because the jobs are not big enough, because they cannot charge more, because the work coming in is price-shopped. It is problem 1 wearing a hat. Fix the quality of work and the hire pays for itself.",
    ask: '"Is it that you can\'t find them, or that you can\'t justify the money on the work you\'ve got on?"',
    book:
      "This is the highest-value conversation on the page when you land it, because you have named something they have not articulated themselves. Do not lecture them through the chain on a cold call — ask the question and let them get there.",
  },
];

const CHAIN = [
  "Can't hire anyone good",
  "Can't pay what good costs",
  "Margin isn't there",
  "Jobs are too small",
  "Can't charge more",
  "Work coming in is price-shopped",
];

const WOM_IMPLIES: { problem: string; why: string }[] = [
  {
    problem: "Inconsistency",
    why: "Referrals arrive when they arrive. You cannot turn word of mouth up in a quiet fortnight, which is exactly when you need it.",
  },
  {
    problem: "Quality",
    why: "You take whatever the referral is. No choosing the switchboard upgrade over the light switch — you get what you are given.",
  },
  {
    problem: "Volume",
    why: "It has a ceiling, and the ceiling is how many people happen to be talking about them this month.",
  },
  {
    problem: "Pricing pressure",
    why: "Referrals often come with a mate's-rate expectation attached, so they are frequently the lowest-margin work in the book.",
  },
];

export function ProblemsPanel() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Five problems. Find one, book the meeting about it.</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone you ring has at least one of these. Your job is not to solve it on the phone — it is to work out
          which one it is, get them to describe it in their own words, and book the meeting about that specific thing.
          A meeting booked about a named problem gets kept. A meeting booked about "marketing" does not.
        </p>
      </div>

      <PanelSection
        icon={Stethoscope}
        title="The five"
        description="Two of them are not what they look like. Read 3 and 5 properly."
      >
        <div className="space-y-2.5">
          {PROBLEMS.map((p) => (
            <div key={p.n} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-border font-mono text-[9px]">{p.n}</Badge>
                <span className="text-sm font-semibold">{p.name}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.looksLike}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.sounds.map((s) => (
                  <Badge key={s} variant="outline" className="border-border bg-muted/40 font-normal text-[11px]">{s}</Badge>
                ))}
              </div>
              <p className="mt-2 text-sm">
                <span className="font-medium">What it really is: </span>
                <span className="text-muted-foreground">{p.reallyIs}</span>
              </p>
              <p className="mt-1.5 border-l-2 border-primary/50 pl-2 text-sm font-medium">{p.ask}</p>
              <p className="mt-1.5 text-xs">
                <span className="font-medium text-foreground">Booking it: </span>
                <span className="text-muted-foreground">{p.book}</span>
              </p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={GitBranch}
        title="The chain under the hiring problem"
        description="Worth knowing cold, because it is the one place you can tell them something about their own business they have not worked out."
      >
        <div className="space-y-1">
          {CHAIN.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px] text-muted-foreground">
                {i + 1}
              </span>
              <span className={i === CHAIN.length - 1 ? "text-sm font-semibold" : "text-sm"}>{step}</span>
              {i === CHAIN.length - 1 && (
                <Badge variant="outline" className="border-primary/40 bg-primary/10 font-mono text-[9px] uppercase text-primary">
                  the actual problem
                </Badge>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          They start at step 1 and think that is the whole story. You do not walk them down the chain on a cold call —
          that is a lecture, and it is Bede's conversation with the numbers on screen. You ask the one question that
          makes them take the first step themselves, then book the meeting.
        </p>
      </PanelSection>

      <PanelSection
        icon={Megaphone}
        title='"Word of mouth" is the biggest tell on the phones'
        description="The moment you hear it, you already know three things about the business."
      >
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-sm">
            A business running on referrals is not running on a channel, it is running on luck with a ceiling. Hearing
            it tells you they are almost certainly carrying inconsistency, quality and volume at the same time — and
            probably charging less than they should on top.
          </p>
        </div>
        <div className="space-y-1.5">
          {WOM_IMPLIES.map((w) => (
            <div key={w.problem} className="flex flex-wrap items-baseline gap-x-2 border-b border-border/50 py-1.5">
              <span className="text-sm font-medium">{w.problem}</span>
              <span className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">{w.why}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5 text-sm">
          <p className="font-medium">What to do with it</p>
          <p className="text-muted-foreground">
            Do not list all four back at them — that is a lecture and they will feel handled. Pick the one they are
            most likely to feel this week, which is almost always inconsistency, and ask about that.
          </p>
          <p className="mt-1 border-l-2 border-primary/50 pl-2 font-medium">
            "Word of mouth is the best work there is. Only thing is you can't turn it up when it goes quiet — is that
            been the problem, or has it been pretty steady?"
          </p>
          <p className="text-xs text-muted-foreground">
            Agrees with them first, which matters because they are proud of it, then puts the finger on the one thing
            they cannot argue with.
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={Droplet}
        title="Find the bleeding neck"
        description="Everyone has three or four problems. Only one of them is bleeding, and that is the only one worth a meeting."
      >
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-sm">
            A bleeding neck is the problem costing them money or sleep <span className="font-semibold">right now</span>.
            Not the one that would be nice to sort out eventually — the one they were already thinking about before you
            rang. Nobody books a meeting over a mild annoyance. They book over the thing that is bleeding.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-md border border-destructive/30 bg-card px-3 py-2">
            <p className="text-sm font-medium text-destructive">A bleeding neck sounds like</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              <li>• They raise it themselves, unprompted, early</li>
              <li>• There is a number on it — "seventeen grand", "two months left"</li>
              <li>• There is a timeframe — "the last three weeks", "since June"</li>
              <li>• The voice changes. Flatter, or faster, or they swear</li>
              <li>• They keep coming back to it after you have moved on</li>
            </ul>
          </div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="text-sm font-medium">A grumble sounds like</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              <li>• It only comes up because you asked</li>
              <li>• No number and no date attached</li>
              <li>• "Yeah, it's always been a bit like that"</li>
              <li>• They have clearly lived with it for years</li>
              <li>• They move off it the moment you do</li>
            </ul>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          <p className="font-medium">The test</p>
          <p className="border-l-2 border-primary/50 pl-2">
            "If that kept going the way it is for another six months, what does that look like for you?"
          </p>
          <p className="text-muted-foreground">
            A bleeding neck gets a real, specific answer — they have already imagined it. A grumble gets a shrug and
            "ah, we'd manage". That shrug is your answer: there is no meeting here today, set a follow-up and move on.
          </p>
          <p className="pt-1 font-medium">Do not manufacture one</p>
          <p className="text-muted-foreground">
            If nothing is bleeding, nothing is bleeding. Talking someone into a panic they do not feel is how you book
            a meeting that no-shows, and it is the thing that makes a tradie distrust the next caller. A follow-up in
            three months on a real read beats a meeting booked on a fake one.
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={MoveHorizontal}
        title="Building the gap"
        description="The distance between where they are and where they said they want to be. It is the whole reason a meeting feels worth fifteen minutes."
      >
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-sm">
            A problem on its own is just a fact. A problem with a gap around it is a reason to act. The gap is built
            from two things they say themselves — where they are now, and where they want to be — and the space
            between is what the meeting is for.
          </p>
        </div>

        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">1. Get the now</p>
            <p className="mt-0.5 text-sm font-medium">"Roughly what's the business turning over at the moment?" — or, if that is too direct: "how many jobs a week are you running?"</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A number, not a feeling. Jobs per week is easier for a stranger to answer than revenue, and it works just
              as well.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">2. Get the want</p>
            <p className="mt-0.5 text-sm font-medium">"Where'd you want it to be?" or "what would a good year look like?"</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Almost everyone has a number in their head already. You are not planting it, you are asking them to say
              it out loud, which is the part that matters.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">3. Let the gap sit</p>
            <p className="mt-0.5 text-sm font-medium">"So there's a fair bit between those two, isn't there."</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Say it flat, as an observation, then stop. You do not need to dramatise it — they did the arithmetic
              before you finished the sentence.
            </p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">4. Point the meeting at the gap</p>
            <p className="mt-0.5 text-sm font-medium">"That's exactly what the fifteen minutes is for — how you'd close that."</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Now the meeting is about their gap, not about marketing. That is the difference between a booking that
              gets kept and one that gets forgotten by Thursday.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          <p className="font-medium text-destructive">The mistake</p>
          <p className="text-muted-foreground">
            Telling them the gap. "You could easily be doing three times that" is you asserting something about a
            business you have known for ninety seconds, and they will discount it instantly — every caller says a
            version of it. Two numbers out of their own mouth cannot be argued with. Yours can.
          </p>
          <p className="pt-1 font-medium">Keep it small on a cold call</p>
          <p className="text-muted-foreground">
            Two questions and one observation. That is the whole move. The full version — what the gap is costing per
            month, what it means for hiring, what it means in two years — is Bede's on the booked call with the numbers
            on screen. Try to run all of that cold and you will lose them somewhere in the middle.
          </p>
        </div>

        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-sm font-medium">How it fits with the bleeding neck</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The bleeding neck is what hurts. The gap is what they want instead. You need both — pain with no
            destination is just complaining, and a destination with no pain is a daydream. One question each, then
            book the meeting about the space between them.
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={Activity}
        title="Diagnosing on the fly"
        description="You get about two questions. Here is the order that gets you there fastest."
      >
        <div className="space-y-1.5 text-sm">
          <p>
            <span className="font-medium">1. Steady or up and down?</span>{" "}
            <span className="text-muted-foreground">Splits inconsistency out immediately, and it is the most common answer.</span>
          </p>
          <p>
            <span className="font-medium">2. Then, depending on what they said:</span>
          </p>
          <div className="space-y-1 border-l-2 border-border pl-3 text-muted-foreground">
            <p><span className="font-medium text-foreground">"Up and down"</span> → "Where's most of it coming from at the moment?" If the answer is word of mouth, you have your meeting.</p>
            <p><span className="font-medium text-foreground">"Pretty steady"</span> → "Is it the work you actually want, or whatever comes in?" That splits quality from genuinely fine.</p>
            <p><span className="font-medium text-foreground">"Flat out"</span> → "Have you got the capacity if more came in?" That splits capacity from the hiring-money problem.</p>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Two questions, then stop diagnosing and book. You are not running discovery — you are finding the one
            sentence that makes them turn up to the meeting.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
