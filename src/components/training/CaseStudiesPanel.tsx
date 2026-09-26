import { Quote, Trophy, Users, Zap } from "lucide-react";
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
}

const CASES: CaseStudy[] = [
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
  },
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
              <div className="mt-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">On the phone</p>
                <p className="mt-0.5 text-sm">{c.sayIt}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
          <p className="text-sm font-medium">More coming</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            We have results across plumbing, solar and HVAC that are not written up here yet. Rather than paraphrase
            numbers nobody has confirmed, this page carries only what the sales lead has signed off. If you need one
            for a trade that is not listed, ask — do not improvise a comparable.
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
