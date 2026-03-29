import { useState } from "react";
import { Copy, Mic, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    duration: "~20 sec",
    attemptNumber: 1,
    bestFor: "First call attempt — introduce yourself and create curiosity",
    script: `G'day [BUSINESS NAME], it's [YOUR NAME] from [COMPANY]. I was just having a look at your business online and I've got a quick idea that could help you pick up more [TRADE] jobs in [AREA] without spending a fortune on ads. Give us a bell back on [YOUR NUMBER] when you get a sec. Cheers!`,
  },
  {
    id: "vm-second-touch",
    name: "Value Drop",
    duration: "~25 sec",
    attemptNumber: 2,
    bestFor: "Second attempt — add specific value and social proof",
    script: `Hey [BUSINESS NAME], [YOUR NAME] again from [COMPANY]. Just a quick one — we helped a [TRADE] business in [NEARBY SUBURB] go from about 10 enquiries a month to over 40 in just 8 weeks. I reckon we could do something similar for you. Give us a ring on [YOUR NUMBER] — happy to run through the numbers. No pressure at all. Cheers!`,
  },
  {
    id: "vm-third-touch",
    name: "Urgency Builder",
    duration: "~20 sec",
    attemptNumber: 3,
    bestFor: "Third attempt — create gentle urgency",
    script: `G'day [BUSINESS NAME], [YOUR NAME] here. I've tried to get in touch a couple of times — I know you're flat out on the tools. Quick heads up: we've only got a couple of spots left for [TRADE] businesses in [AREA] this month. If you want to have a yarn about it, my number's [YOUR NUMBER]. No worries if it's not for you. Cheers!`,
  },
  {
    id: "vm-breakup",
    name: "Breakup Message",
    duration: "~15 sec",
    attemptNumber: 4,
    bestFor: "Final attempt — respectful close that often triggers callbacks",
    script: `Hey [BUSINESS NAME], [YOUR NAME] from [COMPANY]. I don't want to be a pest, so this'll be my last message. If you ever want to chat about getting more [TRADE] jobs coming through, my number's [YOUR NUMBER]. All the best, mate!`,
  },
  {
    id: "vm-referral",
    name: "Referral Mention",
    duration: "~20 sec",
    attemptNumber: 1,
    bestFor: "When you have a referral or mutual connection",
    script: `G'day [BUSINESS NAME], it's [YOUR NAME] from [COMPANY]. [REFERRAL NAME] suggested I give you a bell — we've been helping them with their online presence and they mentioned you might be interested in something similar. Give us a call on [YOUR NUMBER] when you get a chance. Cheers!`,
  },
  {
    id: "vm-seasonal",
    name: "Seasonal Push",
    duration: "~25 sec",
    attemptNumber: 2,
    bestFor: "Seasonal timing — before busy/quiet periods",
    script: `Hey [BUSINESS NAME], [YOUR NAME] here from [COMPANY]. With [SEASON] coming up, a lot of [TRADE] businesses are getting their marketing sorted now so they're booked solid when things pick up. Just wanted to see if you'd be keen for a quick chat about getting ahead of the competition. My number's [YOUR NUMBER]. Cheers!`,
  },
];

export function VoicemailTemplates() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Script copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Mic className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Voicemail Scripts
        </h3>
      </div>

      <p className="text-[10px] text-muted-foreground mb-3">
        Keep it under 30 seconds. Create curiosity. Give them a reason to call back.
      </p>

      <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
        {VOICEMAIL_TEMPLATES.map((template) => {
          const isSelected = selectedId === template.id;
          return (
            <div
              key={template.id}
              className={cn(
                "rounded-md border transition-all cursor-pointer",
                isSelected
                  ? "border-primary/20 bg-primary/5"
                  : "border-border hover:border-primary/10",
              )}
              onClick={() => setSelectedId(isSelected ? null : template.id)}
            >
              <div className="flex items-center gap-2 p-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 shrink-0">
                  <span className="text-[10px] font-bold text-primary">
                    #{template.attemptNumber}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {template.name}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {template.duration}
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground">
                    {template.bestFor}
                  </span>
                </div>
              </div>

              {isSelected && (
                <div className="px-2.5 pb-2.5">
                  <div className="rounded-md bg-background p-3 relative">
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-line pr-8">
                      {template.script}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(template.script);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    <Play className="h-3 w-3" />
                    Replace [BRACKETS] with prospect details before reading
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
