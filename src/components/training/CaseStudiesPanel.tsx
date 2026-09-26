import { ListChecks, Quote, Trophy, Users, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * Proof. Used well on a cold call this is worth more than any argument; used
 * badly it is the fastest way to sound like every other agency that has rung
 * them.
 *
 * The rule that comes out of the call research: relevance beats scale. A
 * four-man business down the road doing well earns real recognition. A $240k
 * month earns "that's cool" and nothing else.
 */

interface CaseStudy {
  business: string;
  trade: string;
  subTrade: string;
  headline: string;
  detail: string[];
  useWhen: string;
  sayIt: string;
  quote?: { text: string; who: string };
}

const CASES: CaseStudy[] = [
  {
    business: "Hobsons Bay Plumbing",
    trade: "Plumbing",
    subTrade: "Maintenance + service, crew of six",
    headline: "Roughly $650k to $1.45m in twelve months",
    detail: [
      "Joel found us the same way you'll find people — a cold call, while he was stuck with an agency that was promising the world and not delivering.",
      "Before us he was doing about 90 jobs a month, and in his words they weren't the jobs he wanted to be doing.",
      "First $250,000 month in June 2026.",
      "Now employs six qualified plumbers.",
      "Nearly walked at about the four-month mark, until he could finally see which jobs came from where.",
    ],
    useWhen:
      "The best one for any plumber, and the best one full stop for a prospect in mindset 2 — burnt, still with the last mob, cynical. Joel was exactly that when we rang him.",
    sayIt:
      '"The bloke we work with over in the west was in the same spot — stuck with an agency promising him the world. He was doing 90 jobs a month and reckoned none of them were the jobs he wanted. Bede can show you what that looks like now."',
    quote: {
      text: "For every dollar we spend, we get $6 back on our Google ads, and $12 back for our SEO.",
      who: "Joel Giordimaina, on camera",
    },
  },
  {
    business: "Near Me Electrical",
    trade: "Electrical",
    subTrade: "Residential — day to day + emergency",
    headline: "$8k a month to $50k a month in two months",
    detail: [
      "Came on doing about $8,000 a month. Inside two months he was doing around $50,000.",
      "Runs emergency work at night on top of the day-to-day work.",
      "Now so busy with the day-to-day work coming through that he is barely running ads at all.",
      "When he does switch the evening ads on, roughly $300 of spend returns $3,000 to $4,000 of work.",
      "His problem now is finding more blokes, not finding more work.",
    ],
    useWhen:
      "Best fit for a resi sparky, especially one who already does or wants emergency. Also lands with anyone in mindset 1 who is trying to get off the ground.",
    sayIt:
      '"We work with a sparky doing about eight grand a month when he started — he\'s at fifty now, and his problem these days is finding blokes, not finding work. Bede can show you exactly what that looked like."',
    quote: {
      text: "I had two emergency calls on my Google Ads, and I profit $1,800 on the weekend.",
      who: "Near Me Electrical, recorded call",
    },
  },
  {
    business: "Rapid Plumbing",
    trade: "Plumbing",
    subTrade: "Sydney",
    headline: "An extra $100k a month, after a $60k burn",
    detail: [
      "Came to us properly burnt — a previous agency had charged them around $60,000 and left them with a website that was not doing the job.",
      "We rebuilt the whole thing and took over the marketing.",
      "Has generated an extra $100,000 a month of work since.",
    ],
    useWhen:
      "The single best one for a prospect who has been burnt, which is the biggest group on the phones. They are not going to out-do a $60,000 burn, so it tells them we have seen worse than whatever they are about to describe.",
    sayIt:
      '"We took on a plumber in Sydney who\'d been charged sixty grand by his last mob and had nothing to show for it. We rebuilt the lot — he\'s doing about a hundred grand a month more now."',
  },
  {
    business: "Electropol",
    trade: "Electrical",
    subTrade: "Rural — Smithton, north-west Tasmania",
    headline: "$70k a month to $180k a month in three months",
    detail: [
      "A small rural electrician in Smithton, about as far from a capital city as you can get in this country.",
      "Went from around $70,000 a month to around $180,000 a month inside three months.",
      "Same systems we run for the metro clients — nothing special built for being regional.",
    ],
    useWhen:
      "The answer to \"we're too rural for that\" or \"there's not enough people out here for ads\". It is one of the most common brush-offs outside the capitals and this kills it dead. Also good for anyone who assumes we only work with big-city businesses.",
    sayIt:
      '"We work with a sparky in Smithton, down in north-west Tassie — about as rural as it gets. He went from about seventy grand a month to a hundred and eighty in three months. If it works down there it\'ll work where you are."',
  },
  {
    business: "DK Plumbing",
    trade: "Plumbing",
    subTrade: "Solo operator",
    headline: "$5k a month to $35k a month in two months",
    detail: [
      "A one-man plumbing business that was lucky to turn over $5,000 in a month when we started.",
      "Inside two months he was doing around $35,000 a month.",
      "Cleared roughly $30,000 of debt in under two months of working with us.",
    ],
    useWhen:
      "The one for a solo operator who is genuinely struggling, and for anyone who thinks they are too small to bother. Also the strongest answer to \"I can't afford it\" — he could not either.",
    sayIt:
      '"One of the blokes we work with was a one-man plumbing outfit doing about five grand a month. He\'s at thirty-five now, and he cleared thirty grand of debt inside two months. Bede can show you how that happened."',
  },
  {
    business: "Reno Wax",
    trade: "Renovations",
    subTrade: "Booked-out crew",
    headline: "Booked three months ahead, inside one month",
    detail: [
      "Had gone from being booked months in advance to being lucky to fill the month ahead.",
      "Inside one month with us they were organically booked out three months forward.",
      "Now doing over $100,000 a month.",
      "Their only brake now is staff — they are hunting the next hire and cannot scale faster because they cannot find people.",
    ],
    useWhen:
      "The one for a prospect whose work has gone quiet after previously being flat out — that swing from booked-ahead to scratching is a very specific and very common pain. It is also the proof behind the hiring chain in the Problems module: fix the work coming in and the constraint moves to people.",
    sayIt:
      '"One of the renovation crews we work with had gone from booked months ahead to barely filling the month. One month in they were booked three months forward — now the only thing holding them back is finding blokes."',
  },
  {
    business: "GSC Security",
    trade: "Electrical",
    subTrade: "Security systems, as an add-on service",
    headline: "$60k of work off $3k of ad spend",
    detail: [
      "Ran security work as an add-on alongside their electrical.",
      "$3,000 of ad spend returned roughly $60,000 worth of work — about 20 to 1.",
      "Now so booked out we barely hear from them. They are not even in touch month to month.",
    ],
    useWhen:
      "Two jobs. It is the cleanest spend-to-return number we have, so it suits anyone weighing up whether ads are worth it. And it is the one for a sparky who has a side service they wish they did more of — the add-on is exactly what we pointed the ads at.",
    sayIt:
      '"There\'s a security mob we work with — three grand of ad spend turned into about sixty grand of work. They\'re so flat out now we barely hear from them."',
  },
  {
    business: "Swan Windows",
    trade: "Windows & glazing",
    subTrade: "Started from scratch",
    headline: "Startup to over $120k a month",
    detail: [
      "Came to us as a startup with nothing running.",
      "Now doing over $120,000 a month, and has acquired a competitor along the way.",
      "About $50,000 a month of that work comes through SEO alone.",
    ],
    useWhen:
      "For a brand new business, or anyone who says they are too small or too new to advertise. Also the best one to reach for when the conversation is about SEO rather than ads.",
    sayIt:
      '"We took a windows business from a standing start to over a hundred and twenty grand a month — about fifty of that comes off SEO on its own. They\'ve since bought out a competitor."',
  },
  {
    business: "Smart Space",
    trade: "Trade TBC",
    subTrade: "High-value project work",
    headline: "Over $1m of work closed in three months",
    detail: [
      "Has closed over $1,000,000 worth of work with us inside three months.",
      "A further $500,000-plus sitting in the pipeline, generated organically off the work we have been doing.",
      "Note the difference: the $1m is closed, the $500k is pipeline. Do not add them together.",
    ],
    useWhen:
      "The biggest number we have, so use it sparingly. It is wrong for a solo tradie — relevance beats scale, and a one-man band hearing a million-dollar figure just tunes out. Save it for a larger operator or someone doing project work.",
    sayIt:
      '"One of the businesses we work with has closed over a million dollars of work in three months, with a fair bit more still in the pipeline. Whether that is the right comparison for you is exactly what the fifteen minutes sorts out."',
  },
];


/** Nine is too many to hold in your head. This is the lookup. */
const PICKER: { situation: string; use: string }[] = [
  { situation: "They've been burnt by an agency", use: "Rapid Plumbing — a $60k burn. They won't out-do it." },
  { situation: "Any plumber", use: "Hobsons Bay Plumbing" },
  { situation: "Any sparky", use: "Near Me Electrical" },
  { situation: "Emergency or after-hours work", use: "Near Me Electrical" },
  { situation: '"We\'re too rural / not enough people out here"', use: "Electropol, Smithton" },
  { situation: "Solo operator, or \"I'm too small\"", use: "DK Plumbing" },
  { situation: '"I can\'t afford it"', use: "DK Plumbing — he couldn't either, and cleared $30k of debt." },
  { situation: "Work has gone quiet after being flat out", use: "Reno Wax" },
  { situation: "They doubt ads are worth the money", use: "GSC Security — $3k in, $60k out." },
  { situation: "Brand new business or a startup", use: "Swan Windows" },
  { situation: "The conversation is about SEO, not ads", use: "Swan Windows — $50k a month off SEO alone." },
  { situation: "Larger operator or project work", use: "Smart Space — but only then." },
];

const HOW_TO_USE: { rule: string; detail: string }[] = [
  {
    rule: "Relevance beats scale, every time",
    detail:
      "A four-man business in their trade doing well gets genuine recognition. A huge number gets \"that's cool\" and changes nothing. Match the trade and the size before you match the result — if you have nothing close, do not reach for the biggest one you know.",
  },
  {
    rule: "Never open with it",
    detail:
      "Proof answers a question they have not asked yet. Lead with it and you are pitching a stranger. It belongs after they have told you something about their business, as the reason the meeting is worth fifteen minutes.",
  },
  {
    rule: "One line, then move",
    detail:
      "Two sentences maximum on a cold call. You are not telling the story, you are proving the meeting is worth taking. The story is Bede's with the dashboard open.",
  },
  {
    rule: "Promise the screen, don't describe it",
    detail:
      "Proof on a screen was the only beat that engaged every segment in the call research. On the phone you cannot show anything — so the move is to promise the screenshot, not to narrate it. \"He'll show you the actual account\" beats any number you can say out loud.",
  },
  {
    rule: "Detail questions go to Bede",
    detail:
      "If they start asking what he spends, what the margin was, how long it took — that is a good sign and it is not your conversation. \"That's exactly what Bede will walk you through. Tuesday morning or Thursday?\"",
  },
];

export function CaseStudiesPanel() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Proof, and how to use it without sounding like everyone else</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A relevant result is the strongest thing you have. A big irrelevant one is worse than nothing, because every
          agency that has rung them already led with a big number. Match the trade first, the size second, and keep it
          to one line.
        </p>
      </div>

      <PanelSection
        icon={ListChecks}
        title="Which one to reach for"
        description="Match the situation, not the biggest number. Relevance beats scale every single time."
      >
        <div className="space-y-1">
          {PICKER.map((p) => (
            <div key={p.situation} className="flex flex-wrap items-baseline gap-x-2 border-b border-border/50 py-1.5 text-sm">
              <span className="font-medium">{p.situation}</span>
              <span className="text-muted-foreground">→ {p.use}</span>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={Trophy}
        title="The results you can use"
        description="Know one properly rather than four vaguely."
      >
        <div className="space-y-2.5">
          {CASES.map((c) => (
            <div key={c.business} className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Zap className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold">{c.business}</span>
                <Badge variant="outline" className="border-border bg-muted/40 font-normal text-[10px]">{c.trade}</Badge>
                <Badge variant="outline" className="border-border bg-muted/40 font-normal text-[10px]">{c.subTrade}</Badge>
              </div>
              <p className="mt-1.5 text-base font-semibold text-emerald-700 dark:text-emerald-300">{c.headline}</p>
              <ul className="mt-2 space-y-1">
                {c.detail.map((d) => (
                  <li key={d} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                <span className="font-medium text-foreground">Use it when: </span>
                <span className="text-muted-foreground">{c.useWhen}</span>
              </p>
              {c.quote && (
                <div className="mt-2 border-l-2 border-emerald-500/50 pl-2.5">
                  <p className="text-sm italic">"{c.quote.text}"</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{c.quote.who}</p>
                </div>
              )}
              <div className="mt-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">On the phone</p>
                <p className="mt-0.5 text-sm">{c.sayIt}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
          <p className="text-sm font-medium">What is not here yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Newer plumbing and solar clients are still too early to have a result worth quoting — SMA Plumbing only
            went live in August. Rather than paraphrase numbers nobody has confirmed, this page carries only what the
            sales lead has signed off. If you need one for a trade that is not listed, ask. Do not improvise a
            comparable, and do not stretch one of these two to fit.
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={Users}
        title="How to use a case study on a cold call"
        description="The craft matters more than the numbers. Most setters get this exactly backwards."
      >
        <div className="space-y-2">
          {HOW_TO_USE.map((h) => (
            <div key={h.rule} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-sm font-medium">{h.rule}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{h.detail}</p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={Quote}
        title="Where it fits in the script"
        description="There is exactly one slot for it, and it is already written."
      >
        <div className="space-y-1.5 text-sm">
          <p className="text-muted-foreground">
            The pitch block already has the hook built in:{" "}
            <span className="italic">"we have had great success working with XYZ and XYZ, and we actually have some
            recent, really cool results for your industry."</span>{" "}
            That XYZ is where a relevant business name goes, and the case study is what you have ready if they ask
            "like who?"
          </p>
          <p className="text-muted-foreground">
            If they do ask, that is interest, not an objection. One line, then straight back to the ask for fifteen
            minutes. Do not let a good case study turn into you doing all the talking — the call is still about their
            business, not our other clients.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
