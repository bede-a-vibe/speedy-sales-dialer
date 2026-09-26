import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The original Odin setter script — the exact word track first-time setters
 * use until they're certified. Verbatim from the source document; do not
 * "improve" the wording without the sales lead's sign-off.
 */

type ScriptBlock = {
  label: string;
  lines: string[];
  note?: string;
};

type ScriptSection = {
  key: string;
  title: string;
  blocks: ScriptBlock[];
};

const SCRIPT_SECTIONS: ScriptSection[] = [
  {
    key: "opener",
    title: "1. Opener",
    blocks: [
      {
        label: "The opener",
        lines: [
          "Hey mate, this is _______ from Odin, how have you BEEN mate?",
          "That's the way — I reached out to you at the ass end of (3 months ago) around the advertising for (high value service). Do you remember speaking with me?",
        ],
      },
      {
        label: "If no",
        lines: [
          "Ah fair enough mate, I often forget the name of my first born. (Don't remember what I had for lunch.)",
          "Cool man, just had it in my calendar to reach back out and see how things have been — how's business? How's the marketing treating ya? (Pause)",
        ],
        note: "Mini discovery — let them talk.",
      },
    ],
  },
  {
    key: "pitch",
    title: "2. Pitch",
    blocks: [
      {
        label: "The pitch",
        lines: [
          "Cool man, well the main reason I was reaching out to you today in particular is we have had great success working with XYZ and XYZ, and we actually have some recent, really cool results for your industry. (Pause)",
          "These are the same systems we have used to generate $400 million in client results — and look, at the end of the day, if there was more of the right type of work out there it's worth having a look at, right? (Pause)",
          "All I need from ya is 10–15 on Google Meet to see how this system would work for your business. If we aren't a good fit, you'll walk away with a Blueprint on how to get more of the right type of work by using the system yourself. Sound fair enough?",
          "Perfect — I will show you what is working for our guys in your industry, what they spend, what they make, and also have a bit of a look at what you're currently doing and how the system would work for you.",
        ],
      },
    ],
  },
  {
    key: "prequal",
    title: "3. Pre-qualifying questions",
    blocks: [
      {
        label: "Option 1",
        note: "Make notes and pull up the calendar while asking.",
        lines: [
          "Before we lock in a time, I just have a few quick questions to make sure we can maximise the value of your session with our team:",
          "How many extra (profitable work) could you take on per week?",
          "How many, if any, workers do you have?",
          "Are there other jobs that are more profitable and that you'd like more of?",
        ],
      },
      {
        label: "Option 2",
        lines: [
          "Just so I'm not wasting your time — we don't work with everyone. Usually we're working with guys who have at least one or two others on the tools with them, and who are actively looking to grow or restructure how they bring in work.",
          "What's your team look like right now — just you, or a couple of others as well?",
          "And if something made sense — strategy-wise — would you actually be in a position to invest and act on it? Or would it be something you're planning for later down the track?",
        ],
      },
    ],
  },
  {
    key: "booking",
    title: "4. Appointment setting",
    blocks: [
      {
        label: "Locking it in",
        lines: [
          "Sweet thanks, appreciate your honesty — based on what you've said, I think you will definitely take a lot from the session.",
          "Alright, what would be the best email to send the session invite to? … Sweet thanks.",
          "Would (insert date/time option) work for you?",
        ],
      },
      {
        label: "If they say no",
        lines: [
          "OK, what would be better for you then — morning or arvo?",
          "Then find the next closest available day with a time that they're available.",
        ],
      },
    ],
  },
  {
    key: "ending",
    title: "5. Ending the call",
    blocks: [
      {
        label: "Wrap up",
        lines: [
          "Sweet, I'll get you booked in for … (designated time and day).",
          "You can expect some emails with a bit more information around what we do, and you'll get some reminders about the meeting. If something comes up and you can't make it, please just flick me a text and I will reschedule you.",
        ],
      },
    ],
  },
  {
    key: "commitment",
    title: "6. Commitment lock-in",
    blocks: [
      {
        label: "Stronger commitment",
        lines: [
          "Alright mate, before I let you go, I just want to make sure we're on the same page.",
          "[Closer's name]'s calendar is packed. For each strategy call he has to take time to review your competitors and make sure he's prepared. So each week he looks at who booked slots in his calendar, and he can get a bit cranky if I have booked a bunch of meetings for blokes who don't show up.",
          "Can I count on you to be there?",
          "(Wait for a firm \"Yes\")",
          "Sweet. Now, I know life gets busy — jobs run over, things come up. What's the most likely thing that could get in the way of you making this call?",
          "(Let them answer. Acknowledge whatever they say.)",
          "Okay, I hear you. Look, if something does come up — and I get it, it happens — can you do me a favour and just shoot me a text to let me know instead of just not showing up? That way I can let [Closer's name] know and we can reschedule. Fair?",
          "(Wait for a firm \"Yes\")",
          "Legend. Appreciate that, mate.",
        ],
      },
    ],
  },
  {
    key: "objections",
    title: "7. Objection handles",
    blocks: [
      {
        label: "So much work / busy",
        lines: ["What's the calendar looking like?"],
      },
      {
        label: "Word of mouth",
        lines: [
          "Last time I checked, word of mouth isn't scalable?",
          "If they say \"it's been alright for me\": Say people stop talking — do you have anything in place to future-proof the pipeline so you don't get caught out?",
          "Mate, I am sure if there are ways to future-proof the pipeline, you wouldn't be against that?",
        ],
      },
      {
        label: "Giving work to a mate",
        lines: ["Oh yeah, what sort of mate?"],
      },
      {
        label: "Not interested",
        lines: ["Not interested because it's marketing, or because it's a cold call?"],
      },
    ],
  },
];

export function SetterScriptPanel() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-5 w-5 text-primary" />
          The Setter Script
          <Badge variant="outline" className="ml-1 font-mono text-[10px]">First-timers: use this verbatim</Badge>
        </CardTitle>
        <CardDescription>
          This is the original script. If you're new, run it word for word — don't improvise until you're certified.
          The pauses are part of it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(expanded ? SCRIPT_SECTIONS : SCRIPT_SECTIONS.slice(0, 2)).map((section) => (
          <div key={section.key} className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-primary">{section.title}</p>
            <div className="space-y-3">
              {section.blocks.map((block) => (
                <div key={block.label}>
                  <p className="mb-1 text-xs font-semibold text-foreground">{block.label}</p>
                  {block.note && <p className="mb-1 text-[11px] italic text-muted-foreground">{block.note}</p>}
                  <div className="space-y-1.5">
                    {block.lines.map((line, i) => (
                      <p key={i} className="text-xs leading-relaxed text-muted-foreground">{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className={cn("w-full text-xs")}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <><ChevronUp className="mr-1 h-3.5 w-3.5" /> Show less</>
          ) : (
            <><ChevronDown className="mr-1 h-3.5 w-3.5" /> Show the full script (pitch, pre-qualifying, booking, lock-in, objections)</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
