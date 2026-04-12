import { useMemo, useState } from "react";
import { Copy, Mic, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface VoicemailTemplate {
  id: string;
  name: string;
  duration: string;
  script: string;
  bestFor: string;
  /** Which attempt number this is ideal for */
  attemptNumber: number;
}

interface VoicemailTemplatesProps {
  businessName?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  attemptCount?: number | null;
}

/**
 * Voicemail drop templates for blue-collar / tradie prospects.
 *
 * Follows the Fanatical Prospecting principle: voicemails should be
 * under 30 seconds, create curiosity, and give a clear reason to call back.
 * Language is casual and direct — no corporate speak.
 */
const VOICEMAIL_TEMPLATES: VoicemailTemplate[] = [
  {
    id: "vm-first-touch",
    name: "First Touch",
    duration: "~15 sec",
    attemptNumber: 1,
    bestFor: "First voicemail only — quick context and low-pressure callback reason",
    script: `G'day [BUSINESS NAME], it's [YOUR NAME] from [COMPANY]. Quick one, I noticed a gap that could help you win more [TRADE] jobs in [AREA] without adding extra admin. Give me a bell on [YOUR NUMBER] when you get a sec. Cheers!`,
  },
  {
    id: "vm-second-touch",
    name: "Light Value Drop",
    duration: "~25 sec",
    attemptNumber: 2,
    bestFor: "Second and final voicemail — add light relevance or social proof, still low pressure",
    script: `Hey [BUSINESS NAME], [YOUR NAME] again from [COMPANY]. We recently helped a [TRADE] business in [NEARBY SUBURB] tighten follow-up and pick up more booked jobs. If that is worth a quick look, give me a ring on [YOUR NUMBER] and I will keep it brief. Cheers!`,
  },
  {
    id: "vm-referral",
    name: "Referral Mention",
    duration: "~20 sec",
    attemptNumber: 1,
    bestFor: "First voicemail when you have a real referral or mutual connection",
    script: `G'day [BUSINESS NAME], it's [YOUR NAME] from [COMPANY]. [REFERRAL NAME] suggested I give you a bell. We have been helping them with their online presence and they thought this might be relevant for you too. Call me on [YOUR NUMBER] when you get a chance. Cheers!`,
  },
  {
    id: "vm-seasonal",
    name: "Seasonal Push",
    duration: "~25 sec",
    attemptNumber: 2,
    bestFor: "Second and final voicemail when seasonal timing is the real hook",
    script: `Hey [BUSINESS NAME], [YOUR NAME] here from [COMPANY]. With [SEASON] coming up, a lot of [TRADE] businesses in [AREA] are sorting their pipeline now so they are not scrambling later. If you want a quick idea, give me a ring on [YOUR NUMBER] and I will keep it brief. Cheers!`,
  },
];

function getSeason(date = new Date()) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "autumn";
  if (month >= 5 && month <= 7) return "winter";
  if (month >= 8 && month <= 10) return "spring";
  return "summer";
}

function personaliseScript(template: VoicemailTemplate, context: VoicemailTemplatesProps) {
  const businessName = context.businessName?.trim() || "there";
  const trade = context.industry?.trim() || "trade";
  const area = context.city?.trim() || context.state?.trim() || "your area";
  const nearbySuburb = context.city?.trim() || context.state?.trim() || "nearby";
  const season = getSeason();

  return template.script
    .replace(/\[BUSINESS NAME\]/g, businessName)
    .replace(/\[TRADE\]/g, trade)
    .replace(/\[AREA\]/g, area)
    .replace(/\[NEARBY SUBURB\]/g, nearbySuburb)
    .replace(/\[SEASON\]/g, season);
}

export function VoicemailTemplates(context: VoicemailTemplatesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const voicemailCount = Math.max(0, context.attemptCount ?? 0);
  const recommendedAttempt = Math.max(1, Math.min(2, voicemailCount + 1));

  const personalisedTemplates = useMemo(() => VOICEMAIL_TEMPLATES.map((template) => ({
    ...template,
    personalisedScript: personaliseScript(template, context),
    isRecommended: template.attemptNumber === recommendedAttempt,
  })), [context, recommendedAttempt]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Personalised script copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Mic className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Voicemail Scripts
        </h3>
      </div>

      <p className="mb-3 text-[10px] text-muted-foreground">
        Keep it under 30 seconds. Leave one reason to call back, not a full pitch. Pair the voicemail with a callback task or SMS when the workflow allows. Hard cap: 2 voicemails per outbound sequence.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <Sparkles className="h-3 w-3" />
          Recommended for voicemail #{recommendedAttempt}
        </Badge>
        {voicemailCount >= 2 ? (
          <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-600">
            2 voicemail cap reached, use callback or SMS follow-up instead
          </Badge>
        ) : null}
        {context.businessName ? <span>Scripts are prefilled for {context.businessName}.</span> : null}
      </div>

      <div className="max-h-[350px] space-y-2 overflow-y-auto pr-1">
        {personalisedTemplates.map((template) => {
          const isSelected = selectedId === template.id;
          return (
            <div
              key={template.id}
              className={cn(
                "cursor-pointer rounded-md border transition-all",
                isSelected
                  ? "border-primary/20 bg-primary/5"
                  : "border-border hover:border-primary/10",
              )}
              onClick={() => setSelectedId(isSelected ? null : template.id)}
            >
              <div className="flex items-center gap-2 p-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-[10px] font-bold text-primary">
                    #{template.attemptNumber}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {template.name}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {template.duration}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] text-muted-foreground">
                      {template.bestFor}
                    </span>
                    {template.isRecommended ? (
                      <Badge variant="outline" className="border-primary/30 px-1.5 py-0 text-[9px] text-primary">
                        Recommended
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              {isSelected && (
                <div className="px-2.5 pb-2.5">
                  <div className="relative rounded-md bg-background p-3">
                    <p className="whitespace-pre-line pr-8 text-xs leading-relaxed text-foreground">
                      {template.personalisedScript}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute right-2 top-2 h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(template.personalisedScript);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    <Play className="h-3 w-3" />
                    Only lead details are prefilled. Add your name, company, callback number, and any referral detail before reading.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
