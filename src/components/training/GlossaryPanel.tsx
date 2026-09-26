import { useMemo, useState } from "react";
import { BookA, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelSection } from "@/components/training/PanelSection";
import { cn } from "@/lib/utils";

/**
 * The index. Every term a setter will hear, from either side of the call, in
 * plain English with the reason a tradie would care.
 *
 * Two rules for everything in here: say the words out loud, never the acronym,
 * and if a definition needs jargon to explain it, the definition is wrong.
 */

type Cat = "money" | "marketing" | "trade" | "sales";

interface Term {
  term: string;
  aka?: string;
  cat: Cat;
  plain: string;
  why: string;
}

const CATS: { key: Cat; label: string }[] = [
  { key: "money", label: "Money & numbers" },
  { key: "marketing", label: "Marketing" },
  { key: "trade", label: "Trade & business" },
  { key: "sales", label: "Sales & the dialer" },
];

const TERMS: Term[] = [
  // ---------- Money & numbers ----------
  {
    term: "Average job value",
    aka: "AJV, average ticket",
    cat: "money",
    plain: "What a typical job is worth. Total revenue divided by number of jobs.",
    why: "The single most useful number on a tradie call. Everything else — what a lead is worth, what they can afford to spend — comes off it. Derive it from revenue divided by jobs rather than trusting what they guess.",
  },
  {
    term: "Average order value",
    aka: "AOV",
    cat: "money",
    plain: "Same idea as average job value, borrowed from retail.",
    why: "Say average job value to a tradie. AOV means nothing to someone who fixes switchboards.",
  },
  {
    term: "Cost to acquire a customer",
    aka: "CAC, cost per acquisition, CPA",
    cat: "money",
    plain: "What it costs in advertising to win one paying job. Ad spend divided by jobs won.",
    why: "The number that decides whether advertising is worth it. $300 to win a $2,000 switchboard job is excellent. $300 to win a $180 tap wash is a disaster. Always set it against their average job value.",
  },
  {
    term: "Cost per lead",
    aka: "CPL",
    cat: "money",
    plain: "What it costs to make one phone ring. Not the same as a job — most leads do not book.",
    why: "Tradies confuse this with cost per job constantly. A $50 lead sounds dear until you know one in three becomes a $1,500 job.",
  },
  {
    term: "Lifetime value",
    aka: "LTV, customer lifetime value, CLV",
    cat: "money",
    plain: "Everything a customer is worth over the whole time they use you, not just the first job.",
    why: "Trades have real repeat value — the maintenance plumber who fixed a tap gets the hot water unit two years later. It is why paying more per job than a competitor can still be the right call.",
  },
  {
    term: "Return on ad spend",
    aka: "ROAS",
    cat: "money",
    plain: "Revenue divided by ad spend. Spend $1,000, make $4,000, that is 4x.",
    why: "The headline number most clients want. Be careful — it is revenue, not profit, so a 4x on thin-margin work can still lose money.",
  },
  {
    term: "Return on investment",
    aka: "ROI",
    cat: "money",
    plain: "Profit relative to what was spent. Unlike ROAS this is after costs.",
    why: "People use ROI and ROAS interchangeably and they are not the same. If you are not sure which someone means, ask.",
  },
  {
    term: "Gross margin",
    cat: "money",
    plain: "What is left of a job after materials and labour, before overheads.",
    why: "Why a busy tradie can still be broke. Big revenue on 6% margin is worse than half the revenue on 40%.",
  },
  {
    term: "Net profit",
    cat: "money",
    plain: "What is actually left at the end, after absolutely everything.",
    why: "The number they should care about and often cannot tell you. \"How profitable were you last month?\" is a question most of them cannot answer.",
  },
  {
    term: "Markup vs margin",
    cat: "money",
    plain: "Markup is what you add to cost. Margin is the share of the sale price you keep. A 50% markup is only a 33% margin.",
    why: "Under-pricing often comes from confusing the two. Do not correct them on a cold call, just note it.",
  },
  {
    term: "Conversion rate",
    cat: "money",
    plain: "What share of something becomes the next thing. Leads to quotes, quotes to jobs.",
    why: "Always ask what is converting into what. \"Our conversion is 30%\" is meaningless on its own.",
  },
  {
    term: "Close rate",
    cat: "money",
    plain: "Share of quotes that turn into paid work.",
    why: "A tradie with a low close rate does not need more leads, they need better pricing or better follow-up. More leads would just mean more quoting for nothing.",
  },
  {
    term: "Break-even",
    cat: "money",
    plain: "The point where the money coming in covers what went out.",
    why: "Useful framing for ad spend — \"how many jobs would this need to bring in before it has paid for itself?\"",
  },
  {
    term: "Payback period",
    cat: "money",
    plain: "How long before the spend pays itself back.",
    why: "Speaks directly to cash flow. A tradie with tight cash cares more about this than total return.",
  },
  {
    term: "Cash flow",
    cat: "money",
    plain: "The timing of money in and out, as distinct from whether you are profitable.",
    why: "A profitable business goes under when $200,000 is sitting in unpaid invoices. This is the number one pain in commercial and construction work.",
  },
  {
    term: "Monthly recurring revenue",
    aka: "MRR",
    cat: "money",
    plain: "Revenue that arrives every month without being re-sold. Our retainers, their maintenance contracts.",
    why: "What a tradie moving into maintenance plans is chasing. It is the difference between a business and a job.",
  },
  {
    term: "Churn",
    cat: "money",
    plain: "Customers who stop. For us, clients who cancel.",
    why: "Relevant because it is why we do not lock people in — if we are not keeping them on results, a contract only delays the problem.",
  },

  // ---------- Marketing ----------
  {
    term: "Google Business Profile",
    aka: "GBP, Google My Business, GMB, \"my Google\"",
    cat: "marketing",
    plain: "The free listing on Google Maps and in the panel beside search results. Phone number, hours, photos, reviews.",
    why: "Often the first thing a customer taps for an emergency or a near-me search — ahead of any website. Say Google profile out loud, never the acronym.",
  },
  {
    term: "Local pack",
    aka: "map pack, the three-pack",
    cat: "marketing",
    plain: "The three business listings with a map that appear at the top of a local search.",
    why: "Being in it is worth more than most of page one. It is what a tradie means by \"getting to the top of Google\".",
  },
  {
    term: "SEO",
    aka: "search engine optimisation",
    cat: "marketing",
    plain: "Work that makes a website show up in unpaid search results. Slow to build, no cost per click once it does.",
    why: "Tradies have usually bought this and usually cannot tell whether it worked. Say \"getting you showing up on Google without paying per click\".",
  },
  {
    term: "Google Ads",
    aka: "PPC, pay per click, AdWords",
    cat: "marketing",
    plain: "Paid listings at the top of search. You pay each time someone clicks.",
    why: "Best fit for urgent, high-intent work — blocked drain, no power. Someone searching that is ready now. Turn it on and the phone rings the same day.",
  },
  {
    term: "Meta ads",
    aka: "Facebook ads, Instagram ads",
    cat: "marketing",
    plain: "Paid ads in social feeds. Shown to people by interest and location, not because they searched.",
    why: "Different job to search. Good for awareness and bigger considered purchases, weaker for emergencies. Tradies widely report Meta leads as lower quality, and often they are right for their work.",
  },
  {
    term: "Intent",
    cat: "marketing",
    plain: "How ready someone is to buy right now. Searching \"emergency electrician near me\" is high intent; scrolling Facebook is low.",
    why: "The cleanest way to explain why search and social behave so differently, without jargon.",
  },
  {
    term: "Impressions",
    cat: "marketing",
    plain: "How many times an ad was shown.",
    why: "A vanity number on its own. If an agency is reporting impressions as the result, that is a red flag worth noting.",
  },
  {
    term: "Click-through rate",
    aka: "CTR",
    cat: "marketing",
    plain: "Share of people who saw the ad and clicked it.",
    why: "Diagnostic, not a result. Nobody pays a bill with a click-through rate.",
  },
  {
    term: "Keywords",
    cat: "marketing",
    plain: "The words someone types into Google that trigger your ad.",
    why: "Where a lot of wasted spend hides. Bidding on \"electrician\" brings in apprentices looking for work and people wanting a light bulb changed.",
  },
  {
    term: "Landing page",
    cat: "marketing",
    plain: "The single page an ad sends someone to, built to make them call.",
    why: "Sending ad traffic to a homepage is one of the most common reasons a previous agency got no results.",
  },
  {
    term: "Retargeting",
    aka: "remarketing",
    cat: "marketing",
    plain: "Showing ads to people who already visited the site.",
    why: "Explains the \"they follow me around the internet\" thing a tradie may have noticed.",
  },
  {
    term: "Attribution",
    cat: "marketing",
    plain: "Working out which marketing actually produced a job.",
    why: "The core of what we do differently. Most tradies genuinely cannot tell you where their work comes from, which is why they cannot tell whether they are being ripped off.",
  },
  {
    term: "Call tracking",
    cat: "marketing",
    plain: "Using a separate phone number per channel so you know which ad made the phone ring.",
    why: "The concrete mechanism behind attribution. Easy to explain and it lands: \"you'd know which ad the call came off\".",
  },
  {
    term: "Lead",
    cat: "marketing",
    plain: "Someone who got in touch. Not a job, not a customer.",
    why: "Our word, not theirs. Say work or jobs. \"Leads\" appears almost nowhere in 72 recorded calls unless we said it first.",
  },
  {
    term: "Directory platforms",
    aka: "hipages, Airtasker, Oneflare, ServiceSeeking",
    cat: "marketing",
    plain: "Sites that sell the same job lead to several tradies who then undercut each other.",
    why: "Near-universal grievance and the fastest common ground on a cold call. Mentioning hipages by name signals you have spoken to people in their trade.",
  },

  // ---------- Trade & business ----------
  {
    term: "Subbie",
    aka: "subcontracting, subbing",
    cat: "trade",
    plain: "Working for another trade or builder rather than your own customers. Paid an hourly or day rate.",
    why: "Usually $75–85 an hour versus $120+ on their own work. Nearly everyone subbing says they want out of it.",
  },
  {
    term: "Charge-up",
    aka: "time and materials, do-and-charge",
    cat: "trade",
    plain: "Billing hours plus parts rather than a fixed quote.",
    why: "Better margin and no risk of under-quoting. Maintenance work is usually charge-up, construction usually quoted.",
  },
  {
    term: "Call-out fee",
    cat: "trade",
    plain: "A fixed charge just for turning up, before any work.",
    why: "How they protect themselves against tiny jobs. Someone with no call-out fee is likely losing money on small work.",
  },
  {
    term: "Progress claim",
    cat: "trade",
    plain: "Invoicing in stages across a long job rather than at the end.",
    why: "Construction-side term. Slow and disputed claims are a major cash-flow pain.",
  },
  {
    term: "Retention",
    cat: "trade",
    plain: "A slice of the money — often 5% — held back by the builder for months after the job is finished.",
    why: "Real money they have earned and cannot touch. Part of why construction plumbers want their own work.",
  },
  {
    term: "Variation",
    cat: "trade",
    plain: "Extra work outside the original quote, which has to be agreed and billed separately.",
    why: "A common source of disputes and unpaid work.",
  },
  {
    term: "30 / 60 day terms",
    cat: "trade",
    plain: "The customer has 30 or 60 days to pay after invoicing.",
    why: "Standard in commercial and industrial and brutal for a small operator carrying wages weekly.",
  },
  {
    term: "Compliance certificate",
    aka: "certificate of electrical safety, COES",
    cat: "trade",
    plain: "The paperwork certifying work was done to standard.",
    why: "Just recognise it. It is admin they find tedious, not a sales angle.",
  },
  {
    term: "On the tools",
    cat: "trade",
    plain: "Doing the physical work yourself, as opposed to running the business.",
    why: "Getting off the tools is the closest thing to a universal goal across every business we have recorded. Tie the conversation to it.",
  },
  {
    term: "The boys",
    cat: "trade",
    plain: "Their employees.",
    why: "Use their unit. \"How many boys have you got on?\" works; \"what's your headcount\" does not.",
  },

  // ---------- Sales & the dialer ----------
  {
    term: "Setter",
    cat: "sales",
    plain: "You. Books qualified meetings for a closer. Does not sell, quote or negotiate.",
    why: "Knowing where the job stops is most of doing it well.",
  },
  {
    term: "Closer",
    cat: "sales",
    plain: "Runs the booked meeting and signs the client. Bede.",
    why: "Every pricing, contract and guarantee question goes here. See the Your Remit module.",
  },
  {
    term: "Decision maker",
    aka: "DM",
    cat: "sales",
    plain: "The person who can actually say yes. Usually the owner.",
    why: "A great conversation with someone who cannot decide is not a booking.",
  },
  {
    term: "Gatekeeper",
    cat: "sales",
    plain: "Whoever answers before the owner does — office manager, partner, apprentice.",
    why: "Be straight and friendly. They remember rudeness and they talk to the person you want.",
  },
  {
    term: "Disposition",
    cat: "sales",
    plain: "The outcome you log at the end of a call.",
    why: "Honest dispositions are why the numbers on these pages exist. Flattering ones make the next version of this playbook worse.",
  },
  {
    term: "Speed to lead",
    cat: "sales",
    plain: "How fast someone gets called after enquiring.",
    why: "Minutes matter. An inbound enquiry sitting for a day is usually gone.",
  },
  {
    term: "Cadence",
    cat: "sales",
    plain: "The planned pattern of follow-up attempts over time.",
    why: "Almost all of our historic contacts were called once and dropped. The re-dial pool is where the bookings are.",
  },
  {
    term: "No-show",
    cat: "sales",
    plain: "A booked meeting the prospect does not attend.",
    why: "What the commitment lock-in exists to prevent. A no-show costs a calendar slot and counts against the booking.",
  },
  {
    term: "Do Not Call",
    aka: "DNC",
    cat: "sales",
    plain: "A contact who has asked not to be rung again.",
    why: "Mark it immediately, no second attempt. Legal obligation, not a judgement call.",
  },
];

export function GlossaryPanel() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Cat | "all">("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TERMS.filter((t) => {
      if (cat !== "all" && t.cat !== cat) return false;
      if (!needle) return true;
      return (
        t.term.toLowerCase().includes(needle) ||
        (t.aka ?? "").toLowerCase().includes(needle) ||
        t.plain.toLowerCase().includes(needle) ||
        t.why.toLowerCase().includes(needle)
      );
    });
  }, [q, cat]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Every term you will hear, in plain English</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          From both sides of the call — our jargon and theirs. Two rules: say the words out loud rather than the
          acronym, and if you cannot explain something without using another piece of jargon, do not raise it on a call.
        </p>
      </div>

      <PanelSection
        icon={BookA}
        title={`${TERMS.length} terms`}
        description="Search by term, nickname or meaning. Everything is one box away mid-call."
      >
        <div className="mb-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search — try CAC, hipages, retention, subbie…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={cat === "all" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setCat("all")}
            >
              All
            </Button>
            {CATS.map((c) => (
              <Button
                key={c.key}
                size="sm"
                variant={cat === c.key ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setCat(c.key)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing for "{q}". If it is a term you actually heard on a call, tell the sales lead and it goes in.
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => (
              <div key={t.term} className={cn("rounded-lg border border-border bg-card p-3")}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold">{t.term}</span>
                  {t.aka && <span className="font-mono text-[11px] text-muted-foreground">{t.aka}</span>}
                  <Badge variant="outline" className="ml-auto border-border bg-muted/40 font-normal text-[10px]">
                    {CATS.find((c) => c.key === t.cat)?.label}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{t.plain}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Why it matters: </span>{t.why}
                </p>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );
}
