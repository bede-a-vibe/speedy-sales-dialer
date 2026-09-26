import { Building2, Droplets, Snowflake, Siren, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * Sub-trades. "Electrician" is not a segment — a resi emergency sparky and an
 * industrial service sparky run different businesses with different cash flow
 * and want different work. Getting this wrong is the fastest way to sound like
 * you have never spoken to anyone in their trade.
 */

interface SubTrade {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  does: string;
  cash: string;
  wants: string;
  angle: string;
  marketing: "strong" | "mixed" | "weak";
}

const ELECTRICAL: SubTrade[] = [
  {
    name: "Residential — day to day",
    icon: Zap,
    does: "Powerpoints, lights, switchboard upgrades, fans, EV chargers, house rewires. Booked work during business hours.",
    cash: "Steady-ish. Paid on completion, usually within the week. The healthiest cash position of the four.",
    wants: "Bigger-ticket jobs — switchboards, mains upgrades, EV chargers, batteries. And often emergency work, because they have seen what it pays.",
    angle:
      "The core group for us and the easiest to help. Ask what their average job is worth and whether they would rather have more of the big ones than more of everything.",
    marketing: "strong",
  },
  {
    name: "Residential — emergency",
    icon: Siren,
    does: "After-hours faults, no power, burning smells, storm damage. Nights and weekends.",
    cash: "Best in the trade. Paid on the spot, premium rates, no quoting against three others.",
    wants: "More of it, and usually more hands to cover it. They already know this work is the good stuff.",
    angle:
      "Highest-intent segment there is. They do not need convincing that advertising works for emergency, they need it running properly. Our flagship result is exactly this — see the Proof module.",
    marketing: "strong",
  },
  {
    name: "HVAC / air conditioning",
    icon: Snowflake,
    does: "Split system installs, ducted, servicing. Heavily seasonal.",
    cash: "Lumpy by definition. Two boom quarters and two quiet ones.",
    wants: "To flatten the season. Filling the shoulder months is worth more to them than a bigger peak, because the peak is already capacity-limited.",
    angle:
      "Do not pitch more volume in summer, they are drowning. Pitch the quiet months. \"What do the in-between months look like?\" opens them straight up.",
    marketing: "strong",
  },
  {
    name: "Industrial / commercial service",
    icon: Building2,
    does: "Plant maintenance, machine faults, three-phase, switchboards for factories and sites. Contract and call-out work for businesses.",
    cash: "Usually the worst. Thirty to sixty day terms, big invoices sitting unpaid, money locked up in work already done.",
    wants: "Often a slice of resi work precisely because it pays on the day. Cash flow is the pain, not volume.",
    angle:
      "Marketing does not really reach their buyer — you do not run Google Ads at a factory maintenance manager. But a lot of them want resi to smooth the cash, and that we can absolutely do. Ask whether they do any domestic work at all.",
    marketing: "weak",
  },
];

const PLUMBING: SubTrade[] = [
  {
    name: "Maintenance / service",
    icon: Droplets,
    does: "Leaks, taps, toilets, hot water, general call-outs. Fast in, fast out.",
    cash: "Good. Small invoices, paid same day, high job count.",
    wants: "More of it, and bigger versions of it. Hot water unit installs are the standout — high value and they are already good at them.",
    angle: "Straightforward volume-and-quality conversation. The most marketable plumbing segment we deal with.",
    marketing: "strong",
  },
  {
    name: "Blocked drains",
    icon: Droplets,
    does: "Jetting, CCTV, clearing. Often the entry point to much bigger work.",
    cash: "Good, and the upsell is where the money is — one in three turns into a dig-up or a reline.",
    wants: "More of the front-end jobs, because they know what fraction converts into the big ticket behind it.",
    angle:
      "They understand lead value better than most trades because they have already done the maths on the conversion. Talk in jobs won, not leads.",
    marketing: "strong",
  },
  {
    name: "Construction / builders' work",
    icon: Building2,
    does: "New builds, fit-outs, subbing to builders and developers.",
    cash: "Bad. Long terms, progress claims, retention held, and the risk of losing half the book overnight when one builder goes quiet.",
    wants: "Their own work. Nearly all of them say some version of getting away from the builders.",
    angle:
      "Do not pitch more construction leads. Pitch the escape route — their own residential work that pays on completion. The concentration risk is the real pain here.",
    marketing: "mixed",
  },
  {
    name: "Commercial / high-ticket niches",
    icon: Building2,
    does: "Backflow, septic, commercial maintenance contracts, relining at scale.",
    cash: "Variable. Big numbers, slow payers.",
    wants: "Recurring contracts and predictable maintenance revenue rather than one-off jobs.",
    angle:
      "Similar to industrial electrical — the buyer is harder to reach with ads. Check whether they run any domestic side before you spend the call on it.",
    marketing: "weak",
  },
];

const MARKETING_STYLES: Record<SubTrade["marketing"], { label: string; cls: string }> = {
  strong: { label: "we help these", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  mixed: { label: "depends", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  weak: { label: "check for resi first", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
};

function SubTradeList({ items }: { items: SubTrade[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((t) => {
        const Icon = t.icon;
        const m = MARKETING_STYLES[t.marketing];
        return (
          <div key={t.name} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm font-semibold">{t.name}</span>
              <Badge variant="outline" className={`font-mono text-[9px] uppercase ${m.cls}`}>{m.label}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.does}</p>
            <div className="mt-2 space-y-1 text-xs">
              <p><span className="font-medium text-foreground">Cash flow: </span><span className="text-muted-foreground">{t.cash}</span></p>
              <p><span className="font-medium text-foreground">Wants: </span><span className="text-muted-foreground">{t.wants}</span></p>
            </div>
            <p className="mt-1.5 text-sm">{t.angle}</p>
          </div>
        );
      })}
    </div>
  );
}

export function TradeSegmentsPanel() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">"Electrician" is not a segment</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A resi emergency sparky and an industrial service sparky run completely different businesses with different
          cash flow and want different work. One question — "what sort of work do you mostly do?" — tells you which
          conversation you are in, and asking it is what makes you sound like you have spoken to people in their trade.
        </p>
      </div>

      <PanelSection
        icon={Zap}
        title="Electrical"
        description="Four sub-trades. The first question on any sparky call is which one."
      >
        <SubTradeList items={ELECTRICAL} />
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-sm font-medium">The crossover worth knowing</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Day-to-day resi sparkies often want emergency work, because it pays premium rates on the spot with no
            quoting. And industrial sparkies often want resi, because their money is locked up in sixty-day terms.
            Both of those are openings, and neither is about volume.
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={Droplets}
        title="Plumbing"
        description="Same principle. The maintenance plumber and the construction plumber have opposite problems."
      >
        <SubTradeList items={PLUMBING} />
      </PanelSection>

      <PanelSection
        icon={Building2}
        title="When marketing genuinely is not the answer"
        description="Say so. It costs you one call and it is the reason the good ones trust you."
      >
        <div className="space-y-1.5 text-sm">
          <p className="text-muted-foreground">
            Pure industrial and pure commercial operators are not reachable the way a homeowner is. Nobody googles
            "emergency switchboard repair" on behalf of a factory — that work comes through contracts, relationships
            and tenders. Pitching ads at it makes you sound like you do not understand their business.
          </p>
          <p className="font-medium">The question that saves the call</p>
          <p className="border-l-2 border-primary/50 pl-2">
            "Is it all commercial, or do you do any domestic on the side?"
          </p>
          <p className="text-muted-foreground">
            A surprising number do a bit of resi, or want to, specifically because it pays on the day instead of in
            sixty. If the answer is genuinely all commercial, tell them straight that this probably is not for them and
            leave it open. That is a good call, not a lost one.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
