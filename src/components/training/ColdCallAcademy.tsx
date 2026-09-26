import { GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SetterScriptStages } from "@/components/training/SetterScriptStages";
import { ReframeLibrary } from "@/components/training/ReframeLibrary";
import { ColdCallOpener } from "@/components/training/ColdCallOpener";
import { ColdBrushOffs } from "@/components/training/ColdBrushOffs";
import { PainHooks } from "@/components/training/PainHooks";
import { WordTracks } from "@/components/training/WordTracks";
import { SetterBoundaries } from "@/components/training/SetterBoundaries";

/**
 * Cold-call training, presented as seven modules in the order a new setter
 * should work through them. Module 1 (the script) is the spine; everything
 * after it is depth on one part of that script.
 *
 * The corpus figures in the header are the real ones. They are not rounded up
 * and they are not padded: 5,573 dial attempts logged, 88 booked meetings,
 * 436 of those calls carry a recording with a real two-way conversation, and
 * the language research sits on top of 72 recorded discovery and closing calls.
 * The authority of this material is that every line in it came off one of our
 * own recordings and can be gone back to and listened to.
 */

const MODULES = [
  {
    value: "script",
    n: 1,
    title: "The script",
    blurb: "Connection, Problem, Solution, Pitch. The spine of every call, with three levels of how closely to follow it.",
    drill: "Run Level 1 verbatim, including the pauses, until the sales lead signs you off. Read the three levels section first — it explains why Bede's own recordings ignore this script and why that is not permission.",
    primary: true,
  },
  {
    value: "reframes",
    n: 2,
    title: "Reframes",
    blurb: "Ten reframes across eight objections, each built on the same four beats: validate, reframe, redirect, normalise.",
    drill: "Learn the price reframe word for word — it is the objection you will hit most and the one most likely to end the call badly. Then learn the four beats so you can build your own.",
    primary: true,
  },
  {
    value: "opener",
    n: 3,
    title: "The first 15 seconds",
    blurb: "What actually separates a call that survives from one that dies, and the two things that feel like failure and are not.",
    drill: "Say your full name and company out loud twenty times before your first dial. Then have someone interrupt you with \"sorry, who?\" and practise repeating it flat and unhurried.",
    primary: true,
  },
  {
    value: "brushoffs",
    n: 4,
    title: "Brush-offs",
    blurb: "The nine things you will hear in the first twenty seconds, ranked by frequency, with what each one is actually worth.",
    drill: "Learn the book rate of the top four. Knowing that \"already got someone\" is the best signal on the board and \"not interested\" is the only real stop will change how you spend your day.",
    primary: true,
  },
  {
    value: "pain",
    n: 5,
    title: "Finding the pain",
    blurb: "Ten things that are genuinely hurting these businesses, and which of them you may ask a stranger about.",
    drill: "Pick three hooks and commit them to memory. One per call, then stop talking. Running the list is an interrogation.",
    primary: false,
  },
  {
    value: "lines",
    n: 6,
    title: "The lines",
    blurb: "Bede's own word tracks, split into the ones that transfer to a cold call and the ones that will backfire in your hands.",
    drill: "Learn the nine on the left properly rather than half-learning thirty. Read the right-hand set once so you recognise them.",
    primary: false,
  },
  {
    value: "remit",
    n: 7,
    title: "Your remit",
    blurb: "The questions that go to Bede, the five hard rules, and what to capture before you hang up.",
    drill: "Memorise the handoff line. It is the answer to every pricing question you will get this week.",
    primary: false,
  },
];

export function ColdCallAcademy() {
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 text-primary">
          <GraduationCap className="h-4 w-4" />
          <span className="text-[10px] uppercase tracking-widest">Cold call training</span>
        </div>
        <CardTitle>Seven modules, in this order</CardTitle>
        <CardDescription>
          Built entirely from Odin's own call history. Nothing here is theory and nothing here is borrowed from a sales
          course — every line came off one of our recordings, and you can go back and listen to any of them.
        </CardDescription>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            ["5,573", "dials logged"],
            ["88", "meetings booked"],
            ["436", "recorded conversations analysed"],
            ["72", "discovery calls mined for language"],
          ].map(([n, label]) => (
            <Badge key={label} variant="outline" className="border-border bg-muted/40 font-normal">
              <span className="font-mono font-semibold text-foreground">{n}</span>
              <span className="ml-1 text-muted-foreground">{label}</span>
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="script" className="space-y-4">
          <TabsList className="grid h-auto grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map((m) => (
              <TabsTrigger
                key={m.value}
                value={m.value}
                className={m.primary ? "border border-primary/40 bg-primary/5" : "border border-border bg-muted/40"}
              >
                <span className="mr-1.5 font-mono text-[10px] opacity-60">{m.n}</span>
                {m.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {MODULES.map((m) => (
            <TabsContent key={m.value} value={m.value} className="space-y-3">
              <div className="rounded-xl border border-border bg-background/60 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-primary">
                  Module {m.n} of {MODULES.length}
                </p>
                <h3 className="mt-0.5 font-medium text-foreground">{m.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{m.blurb}</p>
                <div className="mt-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-primary">Drill this</p>
                  <p className="mt-0.5 text-sm">{m.drill}</p>
                </div>
              </div>

              {m.value === "script" && <SetterScriptStages />}
              {m.value === "reframes" && <ReframeLibrary />}
              {m.value === "opener" && <ColdCallOpener />}
              {m.value === "brushoffs" && <ColdBrushOffs />}
              {m.value === "pain" && <PainHooks />}
              {m.value === "lines" && <WordTracks />}
              {m.value === "remit" && <SetterBoundaries />}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
