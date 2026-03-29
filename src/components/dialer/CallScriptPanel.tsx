import { useState, useMemo } from "react";
import { BookOpen, ChevronDown, ChevronUp, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ScriptPhase = "opener" | "discovery" | "value_prop" | "close" | "objection_bridge";

interface TalkTrackStep {
  phase: ScriptPhase;
  label: string;
  script: string;
  tips?: string;
}

interface IndustryTalkTrack {
  id: string;
  industry: string;
  /** Common pain points for this trade */
  painPoints: string[];
  steps: TalkTrackStep[];
}

const PHASE_LABELS: Record<ScriptPhase, string> = {
  opener: "Opener",
  discovery: "Discovery",
  value_prop: "Value Prop",
  close: "Close",
  objection_bridge: "Objection Bridge",
};

const PHASE_COLOURS: Record<ScriptPhase, string> = {
  opener: "bg-blue-500/10 text-blue-500",
  discovery: "bg-purple-500/10 text-purple-500",
  value_prop: "bg-green-500/10 text-green-500",
  close: "bg-orange-500/10 text-orange-500",
  objection_bridge: "bg-red-500/10 text-red-500",
};

/**
 * Generic talk track that works across all trade industries.
 * Based on the "Cold Calling Sucks" framework + Fanatical Prospecting opener structure.
 */
const GENERIC_TALK_TRACK: TalkTrackStep[] = [
  {
    phase: "opener",
    label: "Pattern Interrupt Opener",
    script: `G'day [NAME], it's [YOUR NAME] from [COMPANY]. I know you weren't expecting my call, so I'll be quick — is now an alright time for 30 seconds?`,
    tips: "Pause after asking. Let them say yes. This micro-commitment keeps them on the line.",
  },
  {
    phase: "discovery",
    label: "Situation Question",
    script: `Quick question — how are you currently getting new [TRADE] jobs coming through? Is it mainly word of mouth, Google, or something else?`,
    tips: "Listen more than you talk. Whatever they say, acknowledge it positively before pivoting.",
  },
  {
    phase: "discovery",
    label: "Pain Question",
    script: `And when things go quiet — like between seasons or when referrals dry up — what do you usually do to fill the pipeline?`,
    tips: "This question surfaces their real pain. Most tradies will admit they don't have a backup plan.",
  },
  {
    phase: "value_prop",
    label: "Tailored Value Statement",
    script: `The reason I'm calling is we specialise in helping [TRADE] businesses in [AREA] get a steady flow of qualified enquiries — without the guesswork. We've helped [X] businesses in your area go from [BEFORE] to [AFTER] in just [TIMEFRAME].`,
    tips: "Use specific numbers. 'We helped 12 plumbers in Sydney's west go from 8 to 35 enquiries a month' is 10x more powerful than vague claims.",
  },
  {
    phase: "close",
    label: "Assumptive Close",
    script: `I'd love to show you exactly how it works — it takes about 15 minutes and there's zero obligation. I've got a spot [DAY] at [TIME] or [DAY] at [TIME] — which works better for you?`,
    tips: "Always offer two specific times. Never ask 'when are you free?' — that's too open-ended.",
  },
  {
    phase: "objection_bridge",
    label: "Bridge Back",
    script: `I completely understand. And look, I wouldn't want you to commit to anything without seeing the full picture. That's exactly why the 15-minute chat is so useful — no pressure, just a look at the numbers. Does [DAY] work?`,
    tips: "Acknowledge → Reframe → Re-ask. Never argue with the prospect.",
  },
];

const INDUSTRY_TALK_TRACKS: IndustryTalkTrack[] = [
  {
    id: "plumbers",
    industry: "Plumbers",
    painPoints: [
      "Emergency calls are unpredictable — feast or famine",
      "Competing with big franchises on Google",
      "Hard to get reviews from happy customers",
      "Apprentice costs going up, need steady work to justify",
    ],
    steps: [
      {
        phase: "opener",
        label: "Plumber-Specific Opener",
        script: `G'day [NAME], it's [YOUR NAME] from [COMPANY]. I help plumbing businesses in [AREA] get more emergency call-outs and bathroom reno enquiries without relying on word of mouth alone. Got 30 seconds?`,
      },
      {
        phase: "discovery",
        label: "Plumber Pain Discovery",
        script: `Are you finding it's mainly emergency work coming through, or are you getting a good mix of maintenance and renovation jobs too?`,
        tips: "Most plumbers want more reno work (higher margins). If they say 'mostly emergencies', that's your angle.",
      },
      {
        phase: "value_prop",
        label: "Plumber Value Prop",
        script: `We helped [EXAMPLE PLUMBER] in [SUBURB] go from about 15 calls a month to over 50 — and the best part is, 60% of those are now renovation and maintenance jobs, not just burst pipes at 2am.`,
      },
    ],
  },
  {
    id: "electricians",
    industry: "Electricians",
    painPoints: [
      "Solar installers eating into traditional sparky work",
      "Residential vs commercial balance",
      "Compliance and safety reputation matters",
      "Hard to stand out when everyone offers the same services",
    ],
    steps: [
      {
        phase: "opener",
        label: "Electrician-Specific Opener",
        script: `G'day [NAME], it's [YOUR NAME] from [COMPANY]. We specialise in helping sparkies in [AREA] fill their books with quality residential and commercial jobs. Quick question — are you mainly chasing resi or commercial work right now?`,
      },
      {
        phase: "value_prop",
        label: "Electrician Value Prop",
        script: `We've been helping electricians in [AREA] stand out from the solar mob by positioning them as the go-to for switchboard upgrades, EV charger installs, and full house rewires. One of our clients went from 2 quote requests a week to 3 a day.`,
      },
    ],
  },
  {
    id: "builders",
    industry: "Builders",
    painPoints: [
      "Long sales cycles — months from enquiry to contract",
      "Need to show portfolio and build trust online",
      "Competition from volume builders on price",
      "Referrals are great but unpredictable",
    ],
    steps: [
      {
        phase: "opener",
        label: "Builder-Specific Opener",
        script: `G'day [NAME], it's [YOUR NAME] from [COMPANY]. I work with custom home builders and renovators in [AREA] to help them attract higher-quality projects — the kind of clients who value quality over the cheapest quote. Got a minute?`,
      },
      {
        phase: "value_prop",
        label: "Builder Value Prop",
        script: `We helped a builder in [SUBURB] go from relying 100% on word of mouth to getting 8–12 qualified renovation enquiries a month through Google. The average project value went from $45K to $120K because we attracted the right type of client.`,
      },
    ],
  },
  {
    id: "hvac",
    industry: "HVAC",
    painPoints: [
      "Highly seasonal — summer and winter peaks",
      "Need to book maintenance contracts in off-season",
      "Big franchises dominate Google Ads",
      "Commercial contracts are the holy grail but hard to win",
    ],
    steps: [
      {
        phase: "opener",
        label: "HVAC-Specific Opener",
        script: `G'day [NAME], it's [YOUR NAME] from [COMPANY]. I help air con and heating businesses in [AREA] stay busy year-round — not just during the summer rush. Got 30 seconds?`,
      },
      {
        phase: "value_prop",
        label: "HVAC Value Prop",
        script: `We helped an HVAC business in [SUBURB] lock in 40+ maintenance contracts during their quiet season, which means they had guaranteed work before summer even hit. That's the kind of pipeline stability we build.`,
      },
    ],
  },
  {
    id: "landscaping",
    industry: "Landscaping",
    painPoints: [
      "Weather-dependent — rain kills schedules",
      "Hard to showcase work without great photos",
      "Competing with weekend warriors and unlicensed operators",
      "Seasonal demand swings",
    ],
    steps: [
      {
        phase: "opener",
        label: "Landscaper-Specific Opener",
        script: `G'day [NAME], it's [YOUR NAME] from [COMPANY]. I work with landscapers in [AREA] to help them attract the bigger projects — full outdoor living spaces, not just mow-and-blow jobs. Quick question — what type of work are you mainly chasing?`,
      },
      {
        phase: "value_prop",
        label: "Landscaper Value Prop",
        script: `We helped a landscaper in [SUBURB] go from mostly small maintenance jobs to landing 3–4 full landscape design projects a month worth $15K–$40K each. The key was getting their portfolio in front of the right homeowners.`,
      },
    ],
  },
];

interface CallScriptPanelProps {
  /** Current contact's industry, if known */
  contactIndustry?: string | null;
}

export function CallScriptPanel({ contactIndustry }: CallScriptPanelProps) {
  const [showGeneric, setShowGeneric] = useState(true);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);

  // Find industry-specific track
  const industryTrack = useMemo(() => {
    if (!contactIndustry) return null;
    const normalised = contactIndustry.toLowerCase().trim();
    return INDUSTRY_TALK_TRACKS.find(
      (t) => t.industry.toLowerCase() === normalised,
    ) ?? null;
  }, [contactIndustry]);

  const activeSteps = showGeneric
    ? GENERIC_TALK_TRACK
    : (industryTrack?.steps ?? GENERIC_TALK_TRACK);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Call Script
        </h3>
      </div>

      {/* Toggle between generic and industry-specific */}
      {industryTrack && (
        <div className="flex gap-1.5 mb-3">
          <button
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[9px] font-medium border transition-all",
              showGeneric
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-muted/20 text-muted-foreground border-border hover:bg-muted/40",
            )}
            onClick={() => setShowGeneric(true)}
          >
            Universal Script
          </button>
          <button
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[9px] font-medium border transition-all",
              !showGeneric
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-muted/20 text-muted-foreground border-border hover:bg-muted/40",
            )}
            onClick={() => setShowGeneric(false)}
          >
            {industryTrack.industry} Script
          </button>
        </div>
      )}

      {/* Pain points for industry */}
      {!showGeneric && industryTrack && (
        <div className="rounded-md bg-orange-500/5 border border-orange-500/10 p-2.5 mb-3">
          <div className="text-[9px] uppercase tracking-wider text-orange-500 font-bold mb-1.5">
            Common Pain Points — {industryTrack.industry}
          </div>
          <ul className="space-y-1">
            {industryTrack.painPoints.map((point, i) => (
              <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                <span className="text-orange-500 mt-0.5">•</span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Script steps */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {activeSteps.map((step, index) => {
          const isExpanded = expandedPhase === index;
          return (
            <div
              key={`${step.phase}-${index}`}
              className={cn(
                "rounded-md border transition-all",
                isExpanded ? "border-primary/20 bg-primary/5" : "border-border hover:border-primary/10",
              )}
            >
              <button
                className="flex w-full items-center gap-2 p-2.5 text-left"
                onClick={() => setExpandedPhase(isExpanded ? null : index)}
              >
                <span className={cn("rounded-full px-2 py-0.5 text-[8px] font-bold uppercase", PHASE_COLOURS[step.phase])}>
                  {PHASE_LABELS[step.phase]}
                </span>
                <span className="text-xs font-medium text-foreground flex-1">
                  {step.label}
                </span>
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div className="px-2.5 pb-2.5 space-y-2">
                  <div className="rounded-md bg-background p-3 relative">
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-line pr-8">
                      {step.script}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => copyToClipboard(step.script)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  {step.tips && (
                    <div className="rounded-md bg-yellow-500/5 border border-yellow-500/10 p-2.5">
                      <div className="text-[9px] uppercase tracking-wider text-yellow-600 font-bold mb-1">
                        Pro Tip
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {step.tips}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
