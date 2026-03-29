import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Copy, MessageSquare, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ObjectionScript {
  id: string;
  objection: string;
  category: "price" | "timing" | "trust" | "competition" | "authority" | "need";
  response: string;
  followUp: string;
}

/**
 * Blue-collar specific objection handlers.
 *
 * These are tailored for tradies and home service businesses —
 * the language is direct, practical, and avoids corporate jargon.
 * Based on Fanatical Prospecting's "Ledge → Disrupt → Ask" framework.
 */
const OBJECTION_SCRIPTS: ObjectionScript[] = [
  {
    id: "too-expensive",
    objection: "We can't afford that / It's too expensive",
    category: "price",
    response:
      "I totally get it — every dollar counts when you're running a trade business. Most of the blokes we work with said the same thing before they saw how quickly it pays for itself. Can I show you what a typical tradie in your area is getting back within the first 30 days?",
    followUp:
      "What would it mean for your business if you had 5–10 extra jobs coming in every month without lifting a finger on marketing?",
  },
  {
    id: "too-busy",
    objection: "I'm flat out / Too busy right now",
    category: "timing",
    response:
      "That's actually the best time to get this sorted — when you're busy, you've got cash flow to invest, and when it quietens down you'll already have leads coming through. Takes 15 minutes to get started. Can we lock in a quick chat this arvo or tomorrow morning?",
    followUp:
      "When's your quietest time of day? I'll make sure we keep it short and sharp.",
  },
  {
    id: "already-have-someone",
    objection: "We already have a marketing guy / agency",
    category: "competition",
    response:
      "No worries at all — that's actually pretty common. A lot of our best clients came to us while they were still with someone else. They just wanted a second opinion on whether they were getting the best bang for their buck. Would you be open to a quick comparison? No pressure, just a 10-minute look.",
    followUp:
      "Out of curiosity, do you know how many leads your current setup is generating each month?",
  },
  {
    id: "not-interested",
    objection: "Not interested / We're all good",
    category: "need",
    response:
      "Fair enough — I hear that a lot, and I respect that. Just so I'm not wasting your time, can I ask one quick question? If I could show you how to get more jobs without spending more on ads, would that be worth a 10-minute conversation?",
    followUp:
      "What's your main way of getting new customers right now — word of mouth, Google, or something else?",
  },
  {
    id: "send-email",
    objection: "Just send me an email / Send me some info",
    category: "timing",
    response:
      "Happy to send something through — but honestly, a generic email won't do your business justice. I'd rather spend 2 minutes understanding what you actually need so I can send you something relevant. What type of work are you mainly chasing right now?",
    followUp:
      "What's the best email for you? And just so I can tailor it — are you mainly after residential or commercial work?",
  },
  {
    id: "need-to-think",
    objection: "I need to think about it / Talk to my partner",
    category: "authority",
    response:
      "Absolutely — it's a big decision and you should take your time. Most tradies find it helpful to jump on a quick call together so everyone's on the same page. Would it work to set up a 15-minute chat with both of you later this week?",
    followUp:
      "What's the main thing you'd want to discuss with them? I can make sure we cover that upfront.",
  },
  {
    id: "had-bad-experience",
    objection: "We've been burnt before / Tried marketing and it didn't work",
    category: "trust",
    response:
      "I'm sorry to hear that — unfortunately it happens way too often in this space. That's exactly why we do things differently. We don't lock you into long contracts, and we track every single lead so you can see exactly what's working. Would you be open to seeing how we're different?",
    followUp:
      "What happened with the last mob you used? That way I can make sure we avoid the same issues.",
  },
  {
    id: "word-of-mouth",
    objection: "We get all our work from word of mouth",
    category: "need",
    response:
      "That's awesome — word of mouth is the best kind of lead. But here's the thing: what happens when referrals slow down? Most tradies we work with started with us as a backup plan, and now it's their number one source. Would you be open to having a chat about building a second stream?",
    followUp:
      "How many new enquiries are you getting per week right now through word of mouth?",
  },
  {
    id: "no-budget",
    objection: "We don't have the budget for marketing",
    category: "price",
    response:
      "I hear you — and I wouldn't want you spending money you don't have. But let me ask you this: if I could show you a way to bring in $5 for every $1 you spend, would that change the conversation? That's what we're seeing with tradies in your area.",
    followUp:
      "What's your average job value? That helps me work out exactly what the return would look like for you.",
  },
  {
    id: "gatekeeper",
    objection: "He's not here / She's on a job site",
    category: "authority",
    response:
      "No dramas — I know tradies are out on the tools most of the day. When's the best time to catch them? Early morning before they head out, or after knock-off? I'll make sure to keep it quick.",
    followUp:
      "Is there a mobile number that's better to reach them on? I'll send a quick text first so they know to expect the call.",
  },
];

const CATEGORY_LABELS: Record<ObjectionScript["category"], string> = {
  price: "Price",
  timing: "Timing",
  trust: "Trust",
  competition: "Competition",
  authority: "Authority",
  need: "Need",
};

const CATEGORY_COLOURS: Record<ObjectionScript["category"], string> = {
  price: "bg-red-500/10 text-red-500 border-red-500/20",
  timing: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  trust: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  competition: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  authority: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  need: "bg-green-500/10 text-green-500 border-green-500/20",
};

export function ObjectionHandler() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<ObjectionScript["category"] | "all">("all");

  const filteredScripts = useMemo(
    () =>
      filterCategory === "all"
        ? OBJECTION_SCRIPTS
        : OBJECTION_SCRIPTS.filter((s) => s.category === filterCategory),
    [filterCategory],
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Objection Handlers
        </h3>
        <span className="ml-auto text-[9px] text-muted-foreground">
          {filteredScripts.length} scripts
        </span>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[9px] font-medium border transition-all",
            filterCategory === "all"
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-muted/20 text-muted-foreground border-border hover:bg-muted/40",
          )}
          onClick={() => setFilterCategory("all")}
        >
          All
        </button>
        {(Object.keys(CATEGORY_LABELS) as ObjectionScript["category"][]).map((cat) => (
          <button
            key={cat}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[9px] font-medium border transition-all",
              filterCategory === cat
                ? CATEGORY_COLOURS[cat]
                : "bg-muted/20 text-muted-foreground border-border hover:bg-muted/40",
            )}
            onClick={() => setFilterCategory(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Script list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {filteredScripts.map((script) => {
          const isExpanded = expandedId === script.id;
          return (
            <div
              key={script.id}
              className={cn(
                "rounded-md border transition-all",
                isExpanded ? "border-primary/20 bg-primary/5" : "border-border hover:border-primary/10",
              )}
            >
              <button
                className="flex w-full items-center gap-2 p-2.5 text-left"
                onClick={() => setExpandedId(isExpanded ? null : script.id)}
              >
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground flex-1">
                  "{script.objection}"
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-[8px] font-medium border", CATEGORY_COLOURS[script.category])}>
                  {CATEGORY_LABELS[script.category]}
                </span>
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div className="px-2.5 pb-2.5 space-y-2">
                  <div className="rounded-md bg-background p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-primary font-bold mb-1">
                          Your Response
                        </div>
                        <p className="text-xs text-foreground leading-relaxed">
                          {script.response}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={() => copyToClipboard(script.response)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md bg-background p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-orange-500 font-bold mb-1">
                          Follow-Up Question
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed italic">
                          {script.followUp}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={() => copyToClipboard(script.followUp)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
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
