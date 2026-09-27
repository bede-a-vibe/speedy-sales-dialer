import { Bug, Building2, Droplets, Hammer, Lock, PanelsTopLeft, Server, Snowflake, Sun, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";
import { usePlaybookLocks, industryLockKey } from "@/hooks/usePlaybookLocks";

/**
 * The industries we ring, with enough depth that a setter sounds like they
 * have spoken to someone in that trade before.
 *
 * Grounded in the 72-call corpus and our own client base. Where a number is
 * quoted it came from a recorded call or a client account, and it is
 * attributed. Where we genuinely do not know, it says so.
 *
 * Sub-trades within electrical and plumbing get their own module — this one is
 * the level above: which industry, and what is true about it.
 */

type Fit = "core" | "good" | "situational" | "hard";

interface Industry {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  fit: Fit;
  theWork: string;
  howTheyGetWork: string;
  money: string;
  seasonality: string;
  theirPain: string;
  ask: string;
  channel: string;
  caseStudy: string;
}

const FIT_STYLES: Record<Fit, { label: string; cls: string }> = {
  core: { label: "core market", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  good: { label: "works well", cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  situational: { label: "depends", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  hard: { label: "harder", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
};

const INDUSTRIES: Industry[] = [
  {
    name: "Electrical",
    icon: Zap,
    fit: "core",
    theWork:
      "Powerpoints, lights, switchboard and mains upgrades, EV chargers, batteries, house rewires, faults. Split across residential day-work, after-hours emergency, air conditioning, and industrial service — and those four are genuinely different businesses. The sub-trades module covers that split.",
    howTheyGetWork:
      "Word of mouth first, then whatever they have bolted on: a half-built Google profile, sometimes hipages, occasionally a mate running ads badly. A large number are still subcontracting to builders or bigger outfits and want out of it.",
    money:
      "Subbie rates run around $75–85 an hour against $120 plus GST on their own work — that gap is why so many want their own customers. Job values swing enormously: a light switch is nothing, a switchboard upgrade or EV charger is real money, and one operator told us a battery job averages about $7,000.",
    seasonality: "Fairly steady year-round. Storm season lifts emergency work; air conditioning arms are heavily summer-weighted.",
    theirPain:
      "Quote-shopped small jobs, thin commercial margins (\"five to six percent on some jobs, lot of work for minimum reward\"), and being stuck on someone else's job list. Emergency operators are the exception — they usually just want more of it.",
    ask: '"What sort of electrical are you mostly doing — resi, commercial, bit of both?"',
    channel: "Google Ads first for anything urgent. SEO and the Google profile behind it. Meta rarely, except for solar and battery work.",
    caseStudy: "Near Me Electrical for emergency, Electripol if they say they're too rural, GSC Security if they have a side service.",
  },
  {
    name: "Plumbing",
    icon: Droplets,
    fit: "core",
    theWork:
      "Maintenance and service call-outs, hot water, blocked drains, gas, bathroom and kitchen work, and construction. Same as electrical, the maintenance plumber and the construction plumber have opposite problems.",
    howTheyGetWork:
      "Heavily word of mouth and repeat. Many are on hipages and most of them resent it. Emergency-adjacent work is the most search-driven of any trade we deal with.",
    money:
      "Average job value sits around $1,300–1,800 across our clients and the industry. Maintenance stacks small jobs fast — one plumber described \"$300 here, $100 there, $400, by the end of the day you made a thousand bucks\". Blocked drains are the gateway: roughly one in three turns into a repair or a reline. Specialist work goes much higher — one operator quoted about $10,000 profit a day on septic drain fields.",
    seasonality: "Steadier than most. Winter lifts hot water and burst pipes; heavy rain lifts drains.",
    theirPain:
      "Construction terms are brutal — 30 to 60 days, progress claims, retention held for months. Tiny jobs that cannot carry the cost of winning them (\"on smaller jobs like tap washes, I can't just bang up $200\"). And price shoppers, especially off the lead platforms.",
    ask: '"Are you mostly doing maintenance and service work, or more of the construction side?"',
    channel: "Google Ads is the backbone — burst pipe, blocked drain and no hot water are about as high-intent as search gets. SEO and Google profile compound behind it.",
    caseStudy: "Hobsons Bay Plumbing for almost anyone. Rapid Plumbing if they've been burnt. DK Plumbing if they're solo or broke.",
  },
  {
    name: "HVAC / air conditioning",
    icon: Snowflake,
    fit: "good",
    theWork: "Split system installs, ducted systems, servicing and maintenance. Frequently run as an arm of an electrical business rather than standalone.",
    howTheyGetWork: "Referrals, repeat servicing, retailer partnerships, and whatever search presence they have built.",
    money: "Installs are solid-ticket work and servicing gives them recurring revenue, which is what most of them actually want more of.",
    seasonality:
      "The most seasonal trade we deal with. Two boom quarters and two quiet ones, every year, without fail.",
    theirPain:
      "The peak is capacity-limited and the troughs are dead. More summer leads are worthless to someone already turning work away in January — what they want is the shoulder months filled.",
    ask: '"What do the in-between months look like for you — outside the busy season?"',
    channel: "Search in season. The real play is booking maintenance and service in the quiet months, which is a different campaign entirely.",
    caseStudy: "No dedicated HVAC result written up yet — use an electrical one and talk about the seasonality honestly.",
  },
  {
    name: "Solar & battery",
    icon: Sun,
    fit: "situational",
    theWork: "Panel installs, battery retrofits, system upgrades. Usually electricians who have specialised.",
    howTheyGetWork: "Rebate-driven demand, lead resellers, referral, and Meta more than most trades because it is a considered purchase.",
    money: "Big ticket, long-ish sales cycle. People get three quotes and think about it, which is unlike most trade work.",
    seasonality:
      "Driven by government rebates more than weather, and that makes it lumpy in a way that catches operators out. One solar client had a rebate end on 1 May, took no leads for three months either side of it, and was sold out for four months — their leads had nowhere to go.",
    theirPain:
      "Rebate cliffs, quote-shopping, and being compared against door-knockers and overseas call centres. Reputation matters more here than in any other trade we deal with.",
    ask: '"Is the work mostly rebate-driven at the moment, or is it steady off its own back?"',
    channel: "Search for the ready-to-buy, Meta genuinely earns its place here for the considered end. One of the few trades where that is true.",
    caseStudy: "No standalone solar result written up. Electripol does solar alongside electrical — check with Bede before leaning on it.",
  },
  {
    name: "Building & renovations",
    icon: Hammer,
    fit: "good",
    theWork: "Kitchens, bathrooms, extensions, full renovations, design-and-build, modular and granny flats.",
    howTheyGetWork: "Referral, past clients, architects and designers, and increasingly social because people want to see the work.",
    money:
      "Very large jobs and long lead times. A single job can be worth more than a month of a maintenance trade, which changes the maths on what a lead is worth entirely.",
    seasonality: "Softer over Christmas and the wet months. Enquiry runs months ahead of the work starting.",
    theirPain:
      "Long, slow pipelines where a quiet month now shows up as a hole six months later — and most of them do not connect those two things. Also quoting for nothing: big detailed quotes against people still collecting ideas. One renovation client put it plainly about social: \"people on Facebook and Instagram, they're just looking for ideas and fun.\"",
    ask: '"How far ahead are you booked at the moment?"',
    channel: "Search for people actively planning, Meta and photos for the considered end. This is a trade where the website genuinely matters, because they will look at the work before they ring.",
    caseStudy: "RenoWorks — went from booked months ahead to barely filling the month, back to three months forward inside one month with us.",
  },
  {
    name: "Windows, glazing & doors",
    icon: PanelsTopLeft,
    fit: "good",
    theWork: "Window and door supply and install, replacement glazing, double glazing, shopfronts.",
    howTheyGetWork: "Builder relationships, referral, and search for retrofit and replacement work.",
    money: "Mid-to-large ticket with a considered buying process. Retrofit and replacement work searches well.",
    seasonality: "Fairly even, with a lift when people do pre-winter comfort and energy work.",
    theirPain: "Competing against big franchised players with much larger budgets, and against builders' preferred suppliers.",
    ask: '"Is it mostly replacement work for homeowners, or are you supplying builders?"',
    channel: "SEO does genuinely well here — the buying process is long enough that people research. Ads for the ready-now retrofit enquiries.",
    caseStudy: "Swan Windows — startup to over $120,000 a month, with about $50,000 a month of that coming off SEO alone.",
  },
  {
    name: "Security, data & cabling",
    icon: Server,
    fit: "situational",
    theWork: "Alarms, CCTV, access control, structured data cabling, network points. Very often an add-on arm of an electrical business.",
    howTheyGetWork: "Mostly referral and existing electrical customers. Rarely marketed on its own, which is exactly the opportunity.",
    money:
      "Good margins, and as an add-on it sells into customers they already have. One security operator turned about $3,000 of ad spend into roughly $60,000 of work.",
    seasonality: "Steady. Break-in coverage in the news lifts residential security enquiry noticeably.",
    theirPain:
      "The commercial and data side is hard to reach with advertising — you do not run search ads at an IT manager. One data cabling operator we recorded had gone from about $40,000 a month down to $20–30,000 and found Meta leads to be poor quality, which for that buyer is unsurprising.",
    ask: '"Is the security side something you actively chase, or does it just come off your electrical customers?"',
    channel: "Residential security searches well. Commercial data and cabling mostly does not — check whether they have a domestic side before spending the call on it.",
    caseStudy: "GSC Security — $3k of spend into about $60k of work, and the add-on angle is the whole point.",
  },
  {
    name: "Pest control & specialist cleaning",
    icon: Bug,
    fit: "good",
    theWork: "Pest treatment and inspections, window cleaning, solar panel cleaning, pressure washing, exterior work.",
    howTheyGetWork: "Search for the urgent end, repeat and contracts for the rest.",
    money:
      "Smaller individual jobs but genuinely recurring — annual treatments, quarterly cleans, contracts. Lifetime value matters far more here than the first job, and most operators under-value it.",
    seasonality: "Pest is strongly seasonal, spiking with warm weather. Cleaning lifts pre-Christmas and pre-sale.",
    theirPain:
      "Low individual job values mean cost per job has to be tight. One pest operator told us he spent about $8,000 with agencies and reckons he got three phone calls out of it.",
    ask: '"Is it mostly one-off jobs, or have you got regulars and contracts?"',
    channel: "Search for the urgent work. The real money is in the recurring side, which is a retention conversation more than an acquisition one.",
    caseStudy: "No written-up result for these yet — ask Bede rather than stretching one of the trades to fit.",
  },
  {
    name: "Pure commercial & industrial",
    icon: Building2,
    fit: "hard",
    theWork: "Plant maintenance, factory and site work, strata, facilities contracts, tenders. Any trade can sit here.",
    howTheyGetWork: "Contracts, tenders, relationships and account management. Almost nothing through search.",
    money: "Large invoices and the worst cash flow of anyone — 30 to 60 day terms with money locked up in completed work.",
    seasonality: "Tied to contract cycles and budget years rather than weather.",
    theirPain:
      "Cash flow and contract concentration, not lead volume. Losing one builder or one contract can take out half the book overnight.",
    ask: '"Is it all commercial, or do you do any domestic on the side?"',
    channel:
      "Honestly, mostly none of ours. Nobody googles an emergency switchboard repair on behalf of a factory. But a lot of them want a residential arm precisely because it pays on the day rather than in sixty — and that we can absolutely do.",
    caseStudy: "Not the right conversation for a case study. Find out whether there is a domestic side first.",
  },
];

export function IndustriesPanel() {
  const { data: locks } = usePlaybookLocks();
  const isLocked = (name: string) => locks?.has(industryLockKey(name)) ?? false;
  const visible = INDUSTRIES.filter((i) => !isLocked(i.name));
  const hidden = INDUSTRIES.filter((i) => isLocked(i.name));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">The industries you'll be ringing</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          You do not need to be able to do their job. You need to know enough that the first thirty seconds does not
          give you away — what the work actually is, how the money moves, and what is genuinely hard about their year.
          One informed question is worth more than any pitch, because it is the thing that tells them you have spoken
          to people like them before.
        </p>
      </div>

      <PanelSection
        icon={Zap}
        title="How to use this"
        description="Read your two core trades properly. Skim the rest until you get one on the phone."
      >
        <div className="space-y-1.5 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Electrical and plumbing are the bulk of the list</span> — learn
            those two before your first shift and come back for the others as they come up.
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">The badge tells you how hard the call is.</span> Core market
            means our proven ground. Harder means marketing may genuinely not be the answer, and saying so is a good
            call rather than a lost one.
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Never use the industry to guess the problem.</span> It tells
            you what to ask, not what they need. A plumber can be any of the five problems, and the diagnosis is still
            two questions and their answer — not your assumption.
          </p>
        </div>
      </PanelSection>

      {visible.map((ind) => {
        const Icon = ind.icon;
        const f = FIT_STYLES[ind.fit];
        return (
          <PanelSection key={ind.name} icon={Icon} title={ind.name}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`font-mono text-[9px] uppercase ${f.cls}`}>{f.label}</Badge>
            </div>

            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">The work: </span>
                <span className="text-muted-foreground">{ind.theWork}</span>
              </p>
              <p>
                <span className="font-medium">How they get work now: </span>
                <span className="text-muted-foreground">{ind.howTheyGetWork}</span>
              </p>
              <p>
                <span className="font-medium">The money: </span>
                <span className="text-muted-foreground">{ind.money}</span>
              </p>
              <p>
                <span className="font-medium">Their year: </span>
                <span className="text-muted-foreground">{ind.seasonality}</span>
              </p>
              <p className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
                <span className="font-medium">What actually hurts: </span>
                <span className="text-muted-foreground">{ind.theirPain}</span>
              </p>
              <p className="border-l-2 border-primary/50 pl-2 font-medium">{ind.ask}</p>
              <p className="text-xs">
                <span className="font-medium text-foreground">What tends to work: </span>
                <span className="text-muted-foreground">{ind.channel}</span>
              </p>
              <p className="text-xs">
                <span className="font-medium text-foreground">Proof to reach for: </span>
                <span className="text-muted-foreground">{ind.caseStudy}</span>
              </p>
            </div>
          </PanelSection>
        );
      })}

      {hidden.length > 0 && (
        <PanelSection
          icon={Lock}
          title={`${hidden.length} ${hidden.length === 1 ? "industry" : "industries"} hidden for now`}
          description="Your manager has parked these so you can focus on what you are actually dialling this week."
        >
          <div className="flex flex-wrap gap-1.5">
            {hidden.map((h) => (
              <Badge key={h.name} variant="outline" className="border-border bg-muted/40 font-normal text-muted-foreground">
                <Lock className="mr-1 h-3 w-3" />{h.name}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            They will appear here when you start calling them. If one turns up on the phone before then, ask rather
            than guessing.
          </p>
        </PanelSection>
      )}

      <PanelSection
        icon={Building2}
        title="Where the gaps are"
        description="Being straight about what we have not got is more useful than pretending."
      >
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            We have no written-up result yet for HVAC, solar on its own, or pest and cleaning. If you get one of those
            on the phone, do not stretch a plumbing or electrical result to fit — ask Bede, or lean on the process
            instead of a number.
          </p>
          <p>
            Seasonality figures and job values here come from recorded calls and client accounts where they are
            attributed, and from general industry ranges where they are not. If a prospect corrects you on one, take
            the correction and write it down. They know their trade and you do not, and agreeing with them costs you
            nothing.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
