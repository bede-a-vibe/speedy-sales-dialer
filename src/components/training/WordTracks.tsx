import { Hourglass, Quote, ShieldX, Speech } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * Bede's own word tracks, lifted from 72 recorded calls.
 *
 * Split deliberately. Most of Bede's best material is a CLOSING battery that
 * needs a booked meeting, a screen share and twenty minutes of trust behind it.
 * Used cold it sounds like a technique, because cold it IS a technique with
 * nothing underneath it. The left-hand set transfers. The right-hand set does
 * not, and is here so you recognise it when you hear Bede use it — not so you
 * copy it.
 */

interface Track {
  line: string;
  surfaced: string;
  source: string;
}

/** Short, factual, safe on a first call. */
const YOURS: Track[] = [
  {
    line: '"In an ideal world, would you be on the tools or off the tools?"',
    surfaced: "Opens the whole desire conversation in one question. Works cold because it is hypothetical, so nobody has to admit anything.",
    source: "Coslec Electrical, 6 Jul",
  },
  {
    line: '"In terms of growing the business right now, on a scale of 1 to 10, what kind of priority is it for you?"',
    surfaced: "A number is easier to give a stranger than a feeling. Whatever they say, the follow-up is the same: \"what would make it a 10?\"",
    source: "Safeguard Plumbing, 3 Mar",
  },
  {
    line: '"How did you land on that, and why is it the way you\'re going about it?"',
    surfaced: "For anyone already advertising. Gets their buying logic out before you have said a word about what we do — which matters, because that group books at 29%.",
    source: "Col Pyke Modular Homes, 27 Jul",
  },
  {
    line: '"What would be the first thing you\'d want to fix?"',
    surfaced: "One prospect just said \"everything\", which was the whole meeting booked in a word. Invites them to issue the verdict instead of you.",
    source: "SMA Plumbing, 17 Jul",
  },
  {
    line: '"Is it the work you actually want, or is it just whatever comes in?"',
    surfaced: "The counter to \"I'm flat out\". Separates busy from satisfied, and flat-out prospects book at 1.6x baseline.",
    source: "Built from the trade-jobs findings",
  },
  {
    line: '"Fair enough. Is that because you\'re flat out as it is, or you\'re just not looking to grow at the minute?"',
    surfaced: "The binary diagnostic. The highest-yield recovery move in the cold-call recordings, because two options are much harder to brush off than an open question.",
    source: "Ron, electrical, 43s call that re-opened",
  },
  {
    line: '"They always tell me they\'ll look at marketing when it\'s quiet. What\'s your experience — is that when you\'ve got money to spend?"',
    surfaced: "Short enough for a cold call and it lands, because the answer is always no. Creates the timing problem without you asserting anything.",
    source: "Zath Electrical, 15 May",
  },
  {
    line: '"I hardly remember what I had for breakfast, let alone a phone call."',
    surfaced: "For \"I don't remember you\", which turns up in 28% of the calls that went on to book. Stops you defending the call.",
    source: "Michael, 772s call that booked",
  },
  {
    line: '"We get enough of them ourselves, to be honest. I don\'t know why we do it either."',
    surfaced: "For \"I get a hundred of you a day\". Sides with the complaint instead of absorbing it. Being the one caller who did not plough on is the differentiator.",
    source: "Recurs across the cold-call corpus",
  },
];

/** Powerful, and wrong in your hands on a first call. */
const BEDES: Track[] = [
  {
    line: '"Now, money aside, could this be the answer for you?"',
    surfaced: "The most-repeated closing question in the corpus, across nine separate calls. It isolates a price objection — which requires a price, which you do not have.",
    source: "Iman Kitchen Renos, Living Electrical, DK Plumbing + 6 more",
  },
  {
    line: '"The version of you that has 10 guys working for you — what decision do you think he makes today?"',
    surfaced: "An identity install. Devastating after twenty minutes of discovery. Cold, from a stranger, it is presumptuous and it reads as a script.",
    source: "Innovative Plumbing Group, 5 May",
  },
  {
    line: '"I look at every week as 2% of the year."',
    surfaced: "Cost-of-delay framing. Needs an agreed goal to be delaying against. Cold, there is no goal yet, so it is just pressure.",
    source: "DK Plumbing, 8 Jul",
  },
  {
    line: '"If I let you off this phone call, how many times do I ring a bloke back in three months and he\'s in the exact same spot?"',
    surfaced: "Works because Bede has earned the right to be blunt. From a setter on a first call it is a guilt trip.",
    source: "Near Me Electrical, 18 Jun",
  },
  {
    line: '"Is this a conversation about permission, or are you telling her you\'re doing it?"',
    surfaced: "Partner isolation. A closing move at the commitment stage. There is nothing to commit to on your call.",
    source: "Shalvin Nadan, 11 Sep",
  },
  {
    line: '"Are you a man of your word?"',
    surfaced: "One prospect committed within five minutes of this. It is a high-risk trust flip that only works with a relationship behind it, and it will end a cold call badly.",
    source: "Rapid Plumbing Group, 24 Jul",
  },
  {
    line: '"If our retainer wasn\'t a factor, would that be something you\'d move forward with?"',
    surfaced: "Isolates money from conviction. Requires a retainer to be on the table. Quoting one is outside your remit.",
    source: "Patrick Paglia Electrical, 27 Jul",
  },
];

const HOW_HE_SOUNDS: { trait: string; detail: string }[] = [
  {
    trait: "Softeners in front of hard questions",
    detail:
      '"Just quickly", "out of interest", "I\'m not a maths genius here, but". The question underneath is direct; the wrapper keeps it from feeling like an interrogation. Copy the wrappers.',
  },
  {
    trait: "Agrees before redirecting, every time",
    detail: '"Fair enough", "no stress", "good on you", "that\'s all good". Never argues with the first thing out of their mouth. Not one recording has him contradicting a prospect early.',
  },
  {
    trait: "Self-deprecating rather than defensive",
    detail: "When caught out, he takes the hit and jokes. It costs nothing and it stops the call becoming a contest.",
  },
  {
    trait: "Tradie register, not agency register",
    detail: '"Chipping away", "mate", "flat out", "the go", "cranking along". He never says optimise, funnel, leverage or solution on a cold call.',
  },
  {
    trait: "Short sentences, then silence",
    detail:
      "The booked calls have him talking noticeably less in the first minute than the dead ones. The pivot line is followed by nothing until the prospect fills it.",
  },
];

export function WordTracks() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Bede's lines, and which ones are yours</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Lifted from 72 recorded calls. Most of his best material is a closing battery that needs a booked meeting and
          twenty minutes of trust behind it. Used cold it sounds like a technique, because cold it is one. Learn the
          left-hand set. Read the right-hand set so you recognise it when you hear him do it.
        </p>
      </div>

      <PanelSection
        icon={Speech}
        title="Yours on a cold call"
        description="Short, factual, and safe from a stranger. Nine lines — learn them properly rather than half-learning thirty."
      >
        <div className="space-y-2">
          {YOURS.map((t) => (
            <div key={t.line} className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
              <p className="text-sm font-medium">{t.line}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.surfaced}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground opacity-70">{t.source}</p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={ShieldX}
        title="Bede's on the booked call, not yours"
        description="These are here so you can recognise them, not use them. Every one needs something a first call does not have."
      >
        <div className="space-y-2">
          {BEDES.map((t) => (
            <div key={t.line} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-start gap-2">
                <Badge variant="outline" className="shrink-0 border-destructive/40 bg-destructive/10 font-mono text-[9px] uppercase text-destructive">
                  not yours
                </Badge>
                <p className="flex-1 text-sm font-medium">{t.line}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.surfaced}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground opacity-70">{t.source}</p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={Quote}
        title="How he actually sounds"
        description="Harder to copy than the lines, and worth more. This is the part that makes the lines work."
      >
        <div className="space-y-2">
          {HOW_HE_SOUNDS.map((h) => (
            <div key={h.trait} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-sm font-medium">{h.trait}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{h.detail}</p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={Hourglass}
        title="The mistake to avoid this week"
        description="Every new setter makes it, and the recordings show exactly what it costs."
      >
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p>
            Collecting lines and deploying them. A cold call is not a place to run material — it is a place to ask one
            good question and then stop talking. The prospect saying something true about their business is the entire
            goal, and nothing on this page achieves that if you are still speaking.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            If you only take one thing: <span className="font-medium text-foreground">ask, then wait.</span> The most
            common note across the reviewed calls is a good question ruined by the rep answering it themselves.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
