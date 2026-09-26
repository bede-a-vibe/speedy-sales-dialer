import { FlaskConical, Repeat, Split } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * Reframe library.
 *
 * A reframe is not an objection handle. A handle answers what they said; a
 * reframe changes the belief underneath it so the objection stops applying.
 * "How much is it?" answered with a price is a handle. Answered with "the most
 * expensive marketing is marketing that doesn't work" is a reframe — it moves
 * them from cost-thinking to return-thinking, and the price question dissolves.
 *
 * SPLIT TESTING: every reframe carries a stable `id` and a `variant`. None of
 * them have a measured book rate yet — `status` is "unmeasured" across the
 * board and the UI says so. Nothing here is presented as a result. See the
 * "How we'll actually test these" section for what needs building.
 */

type Status = "unmeasured";

interface Reframe {
  id: string;
  variant: "A" | "B";
  objection: string;
  /** The four beats. Vary ONE at a time when split testing. */
  validate: string;
  reframe: string;
  redirect: string;
  normalise: string;
  belief: string;
  status: Status;
  source: string;
}

const REFRAMES: Reframe[] = [
  {
    id: "price",
    variant: "A",
    objection: '"How much is it going to be?"',
    validate: "Yeah, completely. Great question, man. Completely understand why you asked it.",
    reframe: "You know, just like you, the most expensive form of marketing is marketing that doesn't work.",
    redirect:
      "What we do is we're going to make sure that it's a good fit for you and make sure that there is a strong return on investment for you.",
    normalise: "That's how we do it with everyone.",
    belief: "Moves them off price-as-cost and onto price-as-return. Cheap that fails is the expensive option.",
    status: "unmeasured",
    source: "Bede, verbatim",
  },
  {
    id: "price",
    variant: "B",
    objection: '"How much is it going to be?"',
    validate: "Fair question, and I'd be asking it too.",
    reframe:
      "Honestly though, the number's meaningless until we know what your jobs are worth. Two grand a month is expensive if it does nothing and cheap if it brings you one switchboard job a week.",
    redirect: "That's the bit Bede works out with you on the call — what it'd need to return to be worth doing.",
    normalise: "Nobody signs anything without seeing that first.",
    belief:
      "Same destination, different route: makes the price unanswerable rather than reframing its meaning. Tests whether specificity beats principle.",
    status: "unmeasured",
    source: "Variant for testing against A",
  },
  {
    id: "email",
    variant: "A",
    objection: '"Just send me an email"',
    validate: "Yeah, happy to do that.",
    reframe:
      "Only thing is, an email can't tell me what your jobs are worth, and you can't ask an email a question. You'd read it, think 'yeah maybe', and it'd sit there.",
    redirect: "Fifteen minutes and you'd actually know whether it's worth anything to you.",
    normalise: "That's why we do it on a call rather than a PDF.",
    belief: "Reframes email from low-effort convenience to a dead end that wastes their time too.",
    status: "unmeasured",
    source: "Built on the price pattern",
  },
  {
    id: "all-good",
    variant: "A",
    objection: '"I\'m all good at the moment"',
    validate: "Good to hear, genuinely.",
    reframe:
      "Can I ask though — all good, or as good as it could be? Because most blokes I talk to are doing alright and still couldn't tell you where half their jobs came from.",
    redirect: "Is the work pretty steady, or does it move around month to month?",
    normalise: "Everyone I speak to says the same thing at first, to be fair.",
    belief:
      "Splits 'fine' from 'optimal'. The reflex brush-off books at exactly baseline, so the goal is converting a reflex into a real answer.",
    status: "unmeasured",
    source: "Built on the price pattern",
  },
  {
    id: "burned",
    variant: "A",
    objection: '"I\'ve been burned before"',
    validate: "Yeah, I hear that constantly, and I don't blame you one bit.",
    reframe:
      "Thing is, that's usually the reason to look rather than not to. You already know what bad looks like — you'd spot it in ten minutes, which most people can't.",
    redirect: "What actually went wrong last time?",
    normalise: "Nearly everyone we work with came off a bad one.",
    belief:
      "Turns the scar into qualification. Sympathy alone only softens a burn — the call reviews are clear that structure is what clears it.",
    status: "unmeasured",
    source: "Built on the price pattern; burn is the #1 pain at 28 of 72 calls",
  },
  {
    id: "busy",
    variant: "A",
    objection: '"I\'m too busy / flat out"',
    validate: "Good problem to have, mate.",
    reframe:
      "Blokes always tell me they'll look at marketing when it goes quiet. But when it's quiet is exactly when there's no money to spend on it. Doing it now is the only version that works.",
    redirect: "Is it the work you actually want, or just whatever comes in?",
    normalise: "That's the pattern with everyone I talk to.",
    belief:
      "Inverts the timing logic. Flat-out prospects book at 1.6x baseline, so this is worth working rather than accepting.",
    status: "unmeasured",
    source: "Reframe adapted from Bede, Zath Electrical 15 May",
  },
  {
    id: "have-someone",
    variant: "A",
    objection: '"We\'ve already got someone doing it"',
    validate: "Good, that's better than most — at least something's running.",
    reframe:
      "I'm not ringing to talk you out of them. Half the blokes we speak to keep who they've got. The question is just whether you can actually see what they're doing for you.",
    redirect: "How long have they been on it, and are the jobs coming through?",
    normalise: "Worth knowing either way, isn't it.",
    belief:
      "Removes the replace-or-reject frame so they don't have to defend a decision. This group books at 29%, over 4x baseline — the highest on the board.",
    status: "unmeasured",
    source: "Built on the price pattern",
  },
  {
    id: "tell-me-now",
    variant: "A",
    objection: '"Just tell me over the phone, why do I need a meeting?"',
    validate: "Yeah, I would if I could.",
    reframe:
      "But I'd be guessing. I don't know what your jobs are worth or what you're already spending, so anything I said now would be a made-up number — and you've probably had enough of those.",
    redirect: "Fifteen minutes with your actual numbers on the screen and you'd know for real.",
    normalise: "That's how it goes with everyone.",
    belief:
      "Reframes the meeting from a sales hurdle into the only honest option, and quietly sides with them against people who guess.",
    status: "unmeasured",
    source: "Built on the price pattern",
  },
  {
    id: "word-of-mouth",
    variant: "A",
    objection: '"Word of mouth is fine for us"',
    validate: "It's the best kind of work, no argument.",
    reframe: "Last time I checked though, word of mouth isn't scalable. And people stop talking.",
    redirect: "Have you got anything in place to future-proof the pipeline so you don't get caught out?",
    normalise: "I'm sure if there were ways to do that, you wouldn't be against it.",
    belief: "Already in the approved script. Included here so the four beats are visible.",
    status: "unmeasured",
    source: "Approved script, verbatim",
  },
  {
    id: "cold-call",
    variant: "A",
    objection: '"Is this a cold call?" / "Not interested"',
    validate: "Ha, yeah it is, mate. Fair cop.",
    reframe: "Not interested because it's marketing, or because it's a cold call?",
    redirect: "(Wait. Let them pick one.)",
    normalise: "",
    belief:
      "Honesty disarms, then the fork makes them separate the message from the medium. Already in the approved script. Note that plain \"not interested\" books at 2% — one attempt, then leave cleanly.",
    status: "unmeasured",
    source: "Approved script, verbatim",
  },
];

const ANATOMY: { beat: string; job: string; example: string }[] = [
  {
    beat: "1. Validate",
    job: "Take the fight out of it. You cannot reframe someone who is braced for an argument.",
    example: '"Great question, man. Completely understand why you asked it."',
  },
  {
    beat: "2. Reframe",
    job: "Attack the belief, never the person. This is the only beat that does the actual work.",
    example: '"The most expensive form of marketing is marketing that doesn\'t work."',
  },
  {
    beat: "3. Redirect",
    job: "Point at the criteria you want them judging on, or hand them a question to answer.",
    example: '"We make sure it\'s a good fit and there\'s a strong return on investment for you."',
  },
  {
    beat: "4. Normalise",
    job: "Make it ordinary. Removes the sense that they are being handled or singled out.",
    example: '"That\'s how we do it with everyone."',
  },
];

export function ReframeLibrary() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Reframes</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A handle answers what they said. A reframe changes the belief underneath it, so the objection stops applying.
          "How much is it?" answered with a number is a handle. Answered with "the most expensive marketing is marketing
          that doesn't work" is a reframe — they are now thinking about return instead of cost, and the price question
          has dissolved rather than been dodged.
        </p>
      </div>

      <PanelSection
        icon={Repeat}
        title="The four beats"
        description="Every reframe below is built the same way. Learn the shape and you can build your own."
      >
        <div className="space-y-2">
          {ANATOMY.map((a) => (
            <div key={a.beat} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] font-mono uppercase tracking-widest text-primary">{a.beat}</p>
              <p className="mt-0.5 text-sm">{a.job}</p>
              <p className="mt-0.5 text-xs italic text-muted-foreground">{a.example}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Beat 2 is the one that matters and the one to vary when testing. Beats 1 and 4 are almost interchangeable
          across objections — validate and normalise work the same way regardless of what was said.
        </p>
      </PanelSection>

      <PanelSection
        icon={Split}
        title="The library"
        description="Ten reframes across eight objections. Two variants on price, to be split tested against each other."
      >
        <div className="space-y-2.5">
          {REFRAMES.map((r) => (
            <div key={`${r.id}-${r.variant}`} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{r.objection}</span>
                <Badge variant="outline" className="border-border font-mono text-[9px] uppercase">
                  {r.id}-{r.variant}
                </Badge>
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 font-mono text-[9px] uppercase text-amber-700 dark:text-amber-300">
                  not yet measured
                </Badge>
              </div>

              <div className="mt-2 space-y-1 border-l-2 border-primary/50 pl-2.5">
                <p className="text-sm">{r.validate}</p>
                <p className="text-sm font-medium">{r.reframe}</p>
                <p className="text-sm">{r.redirect}</p>
                {r.normalise && <p className="text-sm">{r.normalise}</p>}
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Belief it shifts:</span> {r.belief}
              </p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground opacity-70">
                {r.source}
              </p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={FlaskConical}
        title="How we'll actually test these"
        description="Every reframe above is currently a hypothesis. None has a measured book rate, and the badges say so."
      >
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Each reframe carries a stable id and a variant letter, so the content is ready to measure. What is missing is
            the recording of which one got used:
          </p>
          <div className="space-y-1.5">
            <p>
              <span className="font-medium">1. A tap in the dialer.</span>{" "}
              <span className="text-muted-foreground">
                One tap on the live call panel to log "used price-A". Without this there is no data, and asking reps to
                remember after the fact will not work.
              </span>
            </p>
            <p>
              <span className="font-medium">2. A row per use.</span>{" "}
              <span className="text-muted-foreground">
                Reframe id, variant, call, rep, timestamp — then joined to the call outcome. Book rate per variant falls
                out of that automatically.
              </span>
            </p>
            <p>
              <span className="font-medium">3. Alternate the variant, don't choose it.</span>{" "}
              <span className="text-muted-foreground">
                If reps pick their favourite, the winner is whichever one confident reps preferred. The dialer should
                serve A or B and tell them which to use.
              </span>
            </p>
            <p>
              <span className="font-medium">4. Wait for real numbers.</span>{" "}
              <span className="text-muted-foreground">
                At a 6.7% baseline you need a few hundred uses per variant before a difference means anything. Two weeks
                of one setter's dials will not settle it — expect this to be a slow read.
              </span>
            </p>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Until then: use the A variants, and treat everything on this page as our best guess rather than a finding.
            The measured numbers on the other modules come from 436 recorded calls. These do not, yet.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
