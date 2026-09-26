import { AlertOctagon, Ear, Languages, Layers, MessageSquareWarning, Quote, ShieldCheck, ThumbsDown, ThumbsUp, Trophy, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Built from Odin's own call research, not invention:
 *  - Tradie Voice of Customer Bank — 72 calls (Mar-Sep 2026), ~2,300 verbatim quotes
 *  - Plumber Segments — 28 plumbing calls across 13 businesses
 *  - Plumber Offer Working Findings — 27 calls, claim-by-claim verification
 *
 * Every quote here is real and attributed. If something isn't in the corpus it
 * isn't on this page.
 */

const SAY_INSTEAD: { avoid: string; say: string; why: string }[] = [
  { avoid: "Leads", say: "Work · jobs", why: "\"Work\" is the universal noun across all 72 calls. \"Leads\" is our word, not theirs." },
  { avoid: "Funnel, ROI, conversion rate", say: "Getting the phone ringing", why: "These three appear ZERO times unprompted in 72 calls. Success is always phone behaviour." },
  { avoid: "Scale to seven figures", say: "Putting another guy on", why: "Growth is counted in blokes, not revenue lines. A big chunk of them actively don't want the empire." },
  { avoid: "SEO, CPL, CRM, GBP", say: "Spell it out", why: "Every acronym got garbled back at us — \"MetaRads\", \"ChatGVT\". If you shorten it, you lose them." },
  { avoid: "$2,000 a month", say: "About the cost of one job a month", why: "Price balks dissolve when restated per job won. Anchor to their average job, not the invoice." },
];

const LISTEN_FOR: { phrase: string; means: string; move: string }[] = [
  {
    phrase: "\"Flat out\" · \"flat chat\" · \"getting slammed\" · \"run off my feet\"",
    means: "Busy right now. This is their default good state, so it is NOT a no.",
    move: "Don't pitch more work. Ask whether it's too much work or still doing the grunt work themselves — that splits capacity problem from structure problem.",
  },
  {
    phrase: "\"Chipping away\" · \"ticking over\" · \"happy to cruise\"",
    means: "Deliberately unambitious. The anti-scale segment is real and sizeable.",
    move: "Never pitch growth. Pitch consistency and getting off the tools. \"I don't want the yacht, I just want to be busy\" is a direct quote.",
  },
  {
    phrase: "\"Quiet\" · \"gone light on\" · \"ebbs and flows\" · \"hot and cold\"",
    means: "The feast-famine cycle — the single most common pain in the corpus.",
    move: "This is your opening. Ask what a quiet week costs them, not what a busy one earns.",
  },
  {
    phrase: "\"On the tools\" / \"off the tools\"",
    means: "Off the tools is the near-universal end goal, across every segment.",
    move: "Tie everything to it. \"I was on the tools until two years ago… I'm forced to be back on. I'm too old for it, man.\" — Will, Revolution Plumbing.",
  },
  {
    phrase: "\"Rinsed\" · \"jibbed\" · \"strung along\" · \"promised the moon\" · \"old mate ghosted me\"",
    means: "Agency scar tissue — the densest vocabulary cluster in the whole corpus.",
    move: "Do not defend our industry and never bag the last mob. Agree it's common, then ask what they were actually promised versus what showed up.",
  },
  {
    phrase: "\"The boys\" · \"a bloke\" · \"my offsider\" · \"one-man band\"",
    means: "How they state their size. Count the boys — that's your segment read.",
    move: "Use their unit back. \"How many boys have you got on at the moment?\" lands; \"what's your headcount\" does not.",
  },
];

const SEGMENTS: { name: string; bottleneck: string; asks: string; needs: string; closes: string }[] = [
  { name: "Solo", bottleneck: "Cash today", asks: "Phone ringing", needs: "Higher average job value", closes: "Month-to-month + same-size proof" },
  { name: "Two-man", bottleneck: "The third hire", asks: "Jobs per week (never \"leads\")", needs: "Predictable weekly volume", closes: "Mutual accountability + exit terms" },
  { name: "Crew", bottleneck: "People and price", asks: "Leads — but names hiring as the block", needs: "Profit visibility, average-job-value defence", closes: "Judgement, and a report that exists" },
  { name: "Commercial", bottleneck: "Contract concentration", asks: "Hiring / a website", needs: "Demand they own", closes: "No money upfront + a date" },
];

const BANNED_CLAIMS: { claim: string; truth: string }[] = [
  { claim: "\"30x return\"", truth: "Nothing in the data exceeds 14x, and that one is an arithmetic error." },
  { claim: "\"In his second year he did $3 million\"", truth: "Hobsons Bay did $1.454M. The $3M is a target, not a result." },
  { claim: "\"From $400,000 a year to $3 million\"", truth: "No $400k baseline exists anywhere in the data." },
  { claim: "\"37% to 65% conversion\"", truth: "Nobody is recorded saying it. The measured series fell 67% to 41%." },
  { claim: "\"12x on SEO\"", truth: "That was a June peak. It was 8x by August." },
  { claim: "\"We tripled them\"", truth: "2.24x." },
  { claim: "\"50% net profit\"", truth: "Xero showed 24%." },
  { claim: "\"Most of our plumbers get 11 to 1\"", truth: "Sample of one." },
];

/** Per-trade job vocabulary. Slang transfers between trades; job nouns do NOT. */
const TRADE_JOBS: { trade: string; want: { job: string; quote: string }[]; sick: { job: string; quote: string }[] }[] = [
  {
    trade: "Plumbers",
    want: [
      { job: "Maintenance — fast in, fast out, quick cash", quote: "\"$300 here, $100 there, $400. By the end of the day you made a thousand bucks.\"" },
      { job: "Hot water installs", quote: "\"Pretty much the hot water unit installs. That's where good money is, and I'm good at them.\"" },
      { job: "Blocked drains as the gateway to dig-ups and relining", quote: "\"When you're there for drains we're upselling pipe relining… one in three we'll get a repair out of.\"" },
      { job: "Commercial and high-ticket niches", quote: "\"Replace a drain field in a septic system, we can get $10,000 profit a day.\"" },
    ],
    sick: [
      { job: "Construction and builders' work", quote: "\"Those are long-term payments. We often find ourselves waiting.\"" },
      { job: "Tiny jobs that can't carry the cost of winning them", quote: "\"On smaller jobs like tap washes, I can't just bang up $200.\"" },
      { job: "Price shoppers and dead quotes", quote: "\"Close to $18,000 in quotes I've sent out. You're a bit too expensive.\"" },
    ],
  },
  {
    trade: "Electricians",
    want: [
      { job: "Switchboards, mains upgrades, EV chargers, aircon, batteries", quote: "\"When he's winning the ACs or the EV chargers or the switchboard upgrades, your dollar value increases.\"" },
      { job: "Emergency work", quote: "\"Two emergency calls off Google Ads and I profit $1,800 on the weekend. Three hours' work.\"" },
      { job: "Their own private residential work instead of subbing", quote: "\"Get away from the subbie work as much as possible.\"" },
      { job: "B2B maintenance plans and recurring work", quote: "\"Recurring revenue with B2B so we could have our maintenance plans in there.\"" },
    ],
    sick: [
      { job: "Subbie rates", quote: "\"Subby for around 80, between 75 and 80 an hour\" — against $120 plus GST on their own work." },
      { job: "Quote-shopping on small jobs", quote: "\"Just going for a light switch… they don't actually need me there. They're just getting quotes.\"" },
      { job: "Commercial margins", quote: "\"You're going in at five to six percent on some jobs. Lot of work for minimum reward.\"" },
      { job: "Bitsy variable work", quote: "\"Bit of this, bit of that. It'd be nice to knock all that back and stick to the core jobs.\"" },
    ],
  },
];

/** Real exchanges from the calls. Outcome tags come from the source files. */
const TRIPLETS: { objection: string; handle: string; reply: string; outcome: "cleared" | "softened" | "unresolved"; why: string }[] = [
  {
    objection: "Been burned — won't be trapped again",
    handle: "\"If we're not good enough to keep your business, there's no way we should be able to trap you. If you leave us after a week, you keep it.\"",
    reply: "\"If you can make me money, you deserve money as well, no doubt.\"",
    outcome: "cleared",
    why: "Risk reversal plus same-side framing. Unarguable — there's nothing for a sceptic to push against.",
  },
  {
    objection: "Hidden exit clause with the last mob",
    handle: "\"We send you out the invoice, you choose to pay it or not.\"",
    reply: "\"Because you're forcing my hand, Bede, I'm going to have to do it, aren't I?\"",
    outcome: "cleared",
    why: "The most extreme risk reversal in the bank. Lands hardest on someone whose live grievance is being locked in.",
  },
  {
    objection: "Sceptical of agencies generally",
    handle: "Opened their own ad account live: \"straight away, already seen a massive issue — look how many competitive search terms you're paying for.\"",
    reply: "\"To be honest, I'd rather sack him now, but I've already paid for it.\"",
    outcome: "cleared",
    why: "Proof substitution. Don't defend the channel — audit their account and let the data indict the incumbent. He signed within a minute.",
  },
  {
    objection: "Previous agency promised results in three months",
    handle: "\"How good was that salesman? You should be seeing leads in that first week. There's no reason you shouldn't.\"",
    reply: "\"Would you be saying, bro, you're doing good, do you want to invest more? I'll turn up the ads myself.\"",
    outcome: "cleared",
    why: "Names the wait-three-months line as a sales technique, then replaces it with a seven-day clock. Timing never came back.",
  },
  {
    objection: "Are you just better at ads than the last guy?",
    handle: "\"It's not about who runs the best ads. It's who knows how to manage the back end — turn a thousand-dollar lead into fifty grand of work.\"",
    reply: "\"I reckon you can handle the front and the back end, Bede.\"",
    outcome: "softened",
    why: "Moves the promise off the axis where he's already been let down twice.",
  },
  {
    objection: "Card-shy after a partner burned him",
    handle: "\"Some agencies get you to pay ad spend and don't spend it all on ads. It's your card, your payment — nothing behind the scenes.\"",
    reply: "Read out his address, then his card number.",
    outcome: "cleared",
    why: "Structural accommodation. Billing spend direct to Google on his own card removed the need for trust entirely.",
  },
];

const FAILED_HANDLES: { situation: string; whatWasSaid: string; result: string; lesson: string }[] = [
  {
    situation: "A full Google Ads horror story",
    whatWasSaid: "\"I can imagine.\"",
    result: "Softened only — he rolled straight into his next gripe. The burn was finally defused later by the no-lock-in terms.",
    lesson: "Sympathy parks a burn, it doesn't clear one. Only structure clears it.",
  },
  {
    situation: "Prospect hesitant but hadn't named why",
    whatWasSaid: "Asked \"what's making you feel hesitant?\" — then answered it himself with a story about another plumber.",
    result: "Unresolved. \"He gave him 20 grand?\" The story distracted, the hesitancy was never named, deal stalled to \"call me back tomorrow\".",
    lesson: "The question was right. Ask it, then WAIT. Your story is not their answer.",
  },
  {
    situation: "Live client complaint: no uplift in calls",
    whatWasSaid: "\"We'll look over that over the weekend.\"",
    result: "Unresolved, and the account left exposed. He'd already said what he needed nine minutes earlier.",
    lesson: "A live results complaint deferred is an account you're about to lose. Handle it on the call.",
  },
  {
    situation: "\"I'll believe it when I see it. I've heard it too many times.\"",
    whatWasSaid: "Nothing — it was left to stand.",
    result: "Unresolved, and he bought anyway, on the fee structure and a $5-a-lead proof point.",
    lesson: "Scepticism doesn't have to be cleared, it has to be outweighed. Don't burn the call arguing with a belief when structure is what's converting.",
  },
];

/** Ranked by how often the family appears across the 72 calls. */
const OBJECTION_FREQUENCY: { cluster: string; calls: number; line: string }[] = [
  { cluster: "Been burned before", calls: 24, line: "\"I'm actually scared because I did try this before and it cost me a lot.\"" },
  { cluster: "Timing / not ready", calls: 18, line: "\"Maybe I'm not quite ready for it just yet.\"" },
  { cluster: "Price / cash flow", calls: 18, line: "\"What scares me is not having the cash flow to pay for your services.\"" },
  { cluster: "Prove it / too good to be true", calls: 17, line: "\"Everyone does that to me. Everyone shows me this.\"" },
  { cluster: "Contracts / lock-in", calls: 14, line: "\"Is it locked in contracts, or is this a week-by-week evaluation?\"" },
  { cluster: "DIY / already have a guy", calls: 12, line: "\"My wife could set up a website herself, on Wix.\"" },
  { cluster: "Partner / spouse sign-off", calls: 12, line: "\"If she said no, I probably wouldn't do it — she's my wife and I like being married.\"" },
  { cluster: "Salesman guard", calls: 8, line: "\"A lot of people say 15 minutes and then they want 40.\"" },
  { cluster: "Can't handle more work", calls: 7, line: "\"If I'm booked 110%, it's going to get extremely stressed.\"" },
  { cluster: "Guarantee demands", calls: 7, line: "\"You can't really guarantee leads, can you?\"" },
];

const EIGHT_MOVES: { move: string; what: string; why: string }[] = [
  { move: "Pressure removal", what: "Give them explicit permission not to buy, or to take the time they asked for.", why: "They arrive expecting a squeeze. Removing it removes the reason to resist." },
  { move: "Risk reversal", what: "Change who carries the downside — no lock-in, refund, pay weekly.", why: "Answers the real fear (being trapped again) rather than the stated one (price)." },
  { move: "Structural accommodation", what: "Keep the price, change the shape. $250 plus $300 a week instead of $2k up front.", why: "A cash-flow objection is arithmetic, not belief." },
  { move: "Proof substitution", what: "Replace the claim with a live screen — a local client's dashboard, their own ad account.", why: "\"Everyone does that to me. Everyone shows me this.\" Claims are the thing they distrust, so stop making them." },
  { move: "Reframe to jobs per dollar", what: "Move the unit from cost or clicks to money in the bank and jobs won.", why: "\"They tell you how many clicks, how many leads, but it doesn't lead to money in the bank, does it?\"" },
  { move: "Same-side framing", what: "Make your incentive visibly identical to theirs, then say it out loud.", why: "\"If your business isn't growing, then I have failed.\"" },
  { move: "Isolation question", what: "\"Putting the money to one side, do you feel this is the right step for you?\"", why: "Separates can't-afford from don't-believe so you handle the real one." },
  { move: "Honest disqualification", what: "Say out loud that they shouldn't buy, or should buy less, or could do it themselves.", why: "Costs revenue now, buys the only currency that moves a burned buyer. \"I'm excited to have a marketing person that actually tells the truth.\"" },
];

function Section({ icon: Icon, title, description, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function TradiePlaybook() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">How tradies actually talk, and what actually sells them</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything below came out of our own recorded calls — 72 of them across electricians, plumbers and builders,
          March to September 2026. The quotes are real and attributed. Learn the language section before your first
          shift: sounding like a marketer is the fastest way to lose a tradie in the first ten seconds.
        </p>
      </div>

      <Section
        icon={Languages}
        title="Say this, not that"
        description="Our vocabulary versus theirs. The left column is how you sound like every other agency that has already rung them."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <th className="py-1.5 pr-3">Don't say</th>
                <th className="py-1.5 pr-3">Say</th>
                <th className="py-1.5">Why</th>
              </tr>
            </thead>
            <tbody>
              {SAY_INSTEAD.map((r) => (
                <tr key={r.avoid} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-3 text-destructive line-through">{r.avoid}</td>
                  <td className="py-2 pr-3 font-medium text-emerald-700 dark:text-emerald-300">{r.say}</td>
                  <td className="py-2 text-xs text-muted-foreground">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        icon={Ear}
        title="Listen for these words"
        description="Their own vocabulary tells you the situation before you ask a single question. This is the fastest qualifying tool you have."
      >
        <div className="space-y-2">
          {LISTEN_FOR.map((l) => (
            <div key={l.phrase} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-sm font-medium">{l.phrase}</p>
              <p className="mt-0.5 text-xs text-muted-foreground"><span className="font-medium text-foreground">Means:</span> {l.means}</p>
              <p className="mt-0.5 text-xs text-muted-foreground"><span className="font-medium text-foreground">Your move:</span> {l.move}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        icon={Layers}
        title="The four buying segments"
        description="Segment by what breaks first, not by headcount — a two-man business can behave like a solo, and a one-man band like a crew."
      >
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-xs font-mono uppercase tracking-widest text-primary">The qualifying question</p>
          <p className="mt-1 text-sm font-medium">"If your work doubled next week, what breaks first?"</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Their answer places them in the table below more reliably than anything on their website.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <th className="py-1.5 pr-3">Segment</th>
                <th className="py-1.5 pr-3">Bottleneck</th>
                <th className="py-1.5 pr-3">Asks for</th>
                <th className="py-1.5 pr-3">Actually needs</th>
                <th className="py-1.5">Closes on</th>
              </tr>
            </thead>
            <tbody>
              {SEGMENTS.map((s) => (
                <tr key={s.name} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-3 font-medium">{s.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{s.bottleneck}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{s.asks}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{s.needs}</td>
                  <td className="py-2 text-muted-foreground">{s.closes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">"More work" is not a safe universal promise.</span> It loses crew
          outright, and with solo it wins the sale then fails the client — one got his ringing phone and was still
          subbing Thursdays a month later.
        </p>
      </Section>

      <Section
        icon={Wrench}
        title="The jobs they want, and the jobs they're sick of"
        description="Slang carries between trades. Job names do not. Naming the right job is what makes you sound like you've spoken to their competitors."
      >
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Never open with "more leads". Open with the job they want more of. A sparky chasing switchboard upgrades and a
          sparky chasing emergency call-outs are two different conversations, and neither of them asked for leads.
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {TRADE_JOBS.map((t) => (
            <div key={t.trade} className="rounded-lg border border-border bg-card p-3">
              <p className="mb-2 text-sm font-semibold">{t.trade}</p>

              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                <ThumbsUp className="h-3 w-3" /> Want more of
              </div>
              <div className="space-y-1.5">
                {t.want.map((j) => (
                  <div key={j.job} className="border-l-2 border-emerald-500/40 pl-2">
                    <p className="text-sm">{j.job}</p>
                    <p className="text-xs italic text-muted-foreground">{j.quote}</p>
                  </div>
                ))}
              </div>

              <div className="mb-1.5 mt-3 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-destructive">
                <ThumbsDown className="h-3 w-3" /> Sick of
              </div>
              <div className="space-y-1.5">
                {t.sick.map((j) => (
                  <div key={j.job} className="border-l-2 border-destructive/40 pl-2">
                    <p className="text-sm">{j.job}</p>
                    <p className="text-xs italic text-muted-foreground">{j.quote}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The pattern underneath both trades is the same: they want fewer, bigger, faster-paying jobs from customers who
          pay full freight. They do not want volume. Pitching volume to a tradie who is already flat out is how you lose
          the call in the first thirty seconds.
        </p>
      </Section>

      <Section
        icon={ShieldCheck}
        title="The eight moves that actually clear objections"
        description="Taken from every objection exchange in the 72 calls, tagged by whether the objection cleared, softened or killed the deal."
      >
        <div className="space-y-1.5">
          {EIGHT_MOVES.map((m, i) => (
            <div key={m.move} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-sm font-medium">{i + 1}. {m.move}</p>
              <p className="text-xs text-muted-foreground">{m.what}</p>
              <p className="mt-0.5 text-xs italic text-muted-foreground">{m.why}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        icon={MessageSquareWarning}
        title="What they object with, ranked"
        description="Out of 72 calls. Learn the top four — they cover most of what you'll hear on the phones."
      >
        <div className="space-y-1">
          {OBJECTION_FREQUENCY.map((o) => (
            <div key={o.cluster} className="flex flex-wrap items-baseline gap-2 border-b border-border/50 py-1.5">
              <Badge variant="outline" className="shrink-0 border-border font-mono text-[10px]">{o.calls}/72</Badge>
              <span className="text-sm font-medium">{o.cluster}</span>
              <span className="w-full text-xs italic text-muted-foreground sm:w-auto sm:flex-1">{o.line}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Being burned before sits underneath most of the others — when you hear price or timing, check whether the
          real objection is the last mob.
        </p>
      </Section>

      <Section
        icon={Quote}
        title="Real exchanges: what was said, what came back"
        description="Straight out of the recordings. The middle column is the prospect's actual next words, which is the only honest way to score a handle."
      >
        <div className="space-y-2.5">
          {TRIPLETS.map((t) => (
            <div key={t.objection} className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    t.outcome === "cleared"
                      ? "border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] uppercase text-emerald-700 dark:text-emerald-300"
                      : t.outcome === "softened"
                        ? "border-amber-500/40 bg-amber-500/10 font-mono text-[10px] uppercase text-amber-700 dark:text-amber-300"
                        : "border-destructive/40 bg-destructive/10 font-mono text-[10px] uppercase text-destructive"
                  }
                >
                  {t.outcome}
                </Badge>
                <span className="text-sm font-medium">{t.objection}</span>
              </div>
              <div className="space-y-1.5 text-sm">
                <p>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">You said</span>
                  <br />
                  {t.handle}
                </p>
                <p className="border-l-2 border-primary/50 pl-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">They said next</span>
                  <br />
                  <span className="font-medium">{t.reply}</span>
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Why it worked:</span> {t.why}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        icon={AlertOctagon}
        title="Handles that did not work, and why"
        description="More useful than the wins. Every one of these sounded fine on the call and cost us the moment."
      >
        <div className="space-y-2">
          {FAILED_HANDLES.map((f) => (
            <div key={f.situation} className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
              <p className="text-sm font-medium">{f.situation}</p>
              <p className="mt-1 text-sm">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">What was said </span>
                {f.whatWasSaid}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Result:</span> {f.result}
              </p>
              <p className="mt-1 text-xs font-medium text-destructive">{f.lesson}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-sm font-medium">The rule these four add up to</p>
          <p className="text-xs text-muted-foreground">
            Scepticism does not have to be cleared to book a meeting. It has to be out-weighed. Don't spend the call
            arguing with a belief when terms, speed and ownership are what convert. Agree with the burn, then hand them
            something structural they can check.
          </p>
        </div>
      </Section>

      <Section
        icon={AlertOctagon}
        title="Claims you must never make"
        description="Every one of these was said to a prospect and is contradicted by our own client data. Repeating them is how we lose a deal at the contract stage, or worse."
      >
        <div className="space-y-1.5">
          {BANNED_CLAIMS.map((c) => (
            <div key={c.claim} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-sm font-medium text-destructive">{c.claim}</p>
              <p className="text-xs text-muted-foreground">{c.truth}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-sm font-medium">The test before you say any number</p>
          <p className="text-xs text-muted-foreground">
            Does a screenshot exist? If you can't picture the dashboard it came from, don't say it. We have exactly one
            strong causal number we own outright: 45% versus 32% close rate between two reps in the same business, same
            leads, same period.
          </p>
        </div>
      </Section>

      <Section
        icon={Trophy}
        title="What actually moves them"
        description="Measured across all four segments, not theory."
      >
        <div className="space-y-1.5 text-sm">
          <p><span className="font-medium">Proof on a screen.</span> <span className="text-muted-foreground">The only beat that engaged every segment. Process walk-throughs drew pure filler; engagement started at the dashboard every single time.</span></p>
          <p><span className="font-medium">Same size, same suburb.</span> <span className="text-muted-foreground">A $240k month bought "that's cool". A four-man neighbour doing well bought genuine recognition. Scale impresses nobody.</span></p>
          <p><span className="font-medium">Month-to-month, no lock-in.</span> <span className="text-muted-foreground">Raised in 20 calls and never once argued with — the single most reliable objection-killer we have. For commercial it changes shape: no money upfront plus a date, because their cash is locked rather than scarce.</span></p>
          <p><span className="font-medium">Tracking real jobs, not clicks.</span> <span className="text-muted-foreground">The most consistent mid-call turning point in the corpus.</span></p>
          <p className="pt-1 text-xs text-muted-foreground">
            One caution: average job value is simultaneously the highest-value message and the most dangerous. The
            rip-off allergy is universal, so it only survives if framed as duty of care to the customer — and it can
            never carry a cold approach.
          </p>
        </div>
      </Section>
    </div>
  );
}
