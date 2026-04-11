import { BookOpenText, Brain, CheckCircle2, ChevronRight, Handshake, MessageSquareQuote, Target, TimerReset, Workflow } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const openerScript = [
  "Hi, it's {rep_name} from SalesDialer. Did I catch you at an okay time for 27 seconds?",
  "I was looking at {business_name} and noticed you already have demand coming in from {channel_or_local_area}.",
  "We help trade businesses turn more of that existing demand into booked jobs without adding admin overhead.",
  "Would it be crazy to ask two quick questions and see if it's worth a proper chat?",
];

const objectionPlays = [
  {
    objection: "Send me information",
    whyItShowsUp: "The prospect is protecting time or does not yet feel a gap worth discussing.",
    response: "Happy to. So I send the right thing, what are you trying to improve most right now: lead volume, quote-to-job conversion, or follow-up speed?",
  },
  {
    objection: "We already have someone",
    whyItShowsUp: "They are signalling status quo, not necessarily satisfaction.",
    response: "Makes sense. We usually help when there is already activity in place. What would you change first if your current setup worked exactly how you wanted?",
  },
  {
    objection: "Too busy right now",
    whyItShowsUp: "Timing is bad, but urgency may still exist.",
    response: "Totally fair. Usually that means one of two things: work is flowing well, or follow-up/admin is stretched. Which one is more true for you this week?",
  },
];

const pipelineGuidance = [
  {
    stage: "Cold outreach",
    focus: "Get permission for discovery, not a full pitch.",
    repMove: "Leave the first call with one concrete pain, one decision-maker detail, and the best next touch path.",
  },
  {
    stage: "Follow-up queued",
    focus: "Convert vague interest into a scheduled next step.",
    repMove: "Reference the exact trigger from the first call, confirm owner, then lock date, time, and channel.",
  },
  {
    stage: "Booked appointment",
    focus: "Protect show rate.",
    repMove: "Restate desired outcome, add calendar context, and capture anything the closer should know before the meeting.",
  },
];

const playbookChecklist = [
  "Confirm decision-maker name and role before ending routed-line calls.",
  "Capture a direct mobile, extension, or best callback window on every enrichment attempt.",
  "Write notes that explain why the next rep should care, not just what happened.",
  "When booking, repeat the date/time and the expected result of the appointment.",
];

const transcriptPatterns = [
  {
    title: "Sub-15 second blow-offs",
    signal: "If the rep cannot earn the first few seconds, the call often dies before there is enough talk time to generate useful transcript intelligence.",
    coaching: "Use a low-friction opener, skip identity confirmation, and earn 30 seconds with one relevant reason for calling.",
    dialerBehavior: "Treat opener quality as a data-quality issue, not just a style issue, because short dead calls create no usable review trail.",
  },
  {
    title: "Good conversation, weak note handoff",
    signal: "Transcript summaries only help the team when the next action and pain point are clear enough to save into notes and CRM follow-up.",
    coaching: "Before ending the call, lock one concrete pain, one owner detail, and one next step you would be happy for another rep to inherit.",
    dialerBehavior: "Write notes that can survive a handoff to the closer or the next caller without replaying the full call.",
  },
  {
    title: "Contact not ready for CRM push",
    signal: "Pipeline findings showed notes can be lost downstream when the contact record is incomplete, even if the call itself was useful.",
    coaching: "Confirm the right contact, best number, and role while you still have the prospect live, especially on trades where mobiles matter.",
    dialerBehavior: "Clean contact capture improves both future dialing and whether transcript learnings make it into the rest of the workflow.",
  },
];

export default function TrainingPage() {
  return (
    <AppLayout title="Training">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <Badge variant="secondary" className="w-fit text-[10px] uppercase tracking-widest">
                Rep enablement foundation
              </Badge>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Training hub for live calling reps</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  A first shipped training surface with practical scripts, objection handling, pipeline guidance, and rep habits. It is structured so future coaching packs can slot in without redesigning the page.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:w-[360px]">
              <Card className="bg-background/70">
                <CardHeader className="pb-2">
                  <CardDescription>Today&apos;s focus</CardDescription>
                  <CardTitle className="text-base">Permission-based openers</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">Lower resistance early, then earn discovery with one specific observation.</CardContent>
              </Card>
              <Card className="bg-background/70">
                <CardHeader className="pb-2">
                  <CardDescription>Manager note</CardDescription>
                  <CardTitle className="text-base">Coach for clarity</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">The best notes explain next action, urgency, and owner in one glance.</CardContent>
              </Card>
              <Card className="bg-background/70">
                <CardHeader className="pb-2">
                  <CardDescription>Expansion ready</CardDescription>
                  <CardTitle className="text-base">More modules later</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">Roleplay libraries, scorecards, onboarding paths, and campaign-specific packs can live here next.</CardContent>
              </Card>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-primary">
                <BookOpenText className="h-4 w-4" />
                <span className="text-[10px] uppercase tracking-widest">Core training modules</span>
              </div>
              <CardTitle>What reps need during a live shift</CardTitle>
              <CardDescription>Each module is concrete enough to use now and cleanly separated for future content growth.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="scripts" className="space-y-4">
                <TabsList className="grid h-auto grid-cols-2 gap-2 bg-transparent p-0 md:grid-cols-5">
                  <TabsTrigger value="scripts" className="border border-border bg-muted/40">Scripts</TabsTrigger>
                  <TabsTrigger value="objections" className="border border-border bg-muted/40">Objections</TabsTrigger>
                  <TabsTrigger value="pipeline" className="border border-border bg-muted/40">Pipeline</TabsTrigger>
                  <TabsTrigger value="patterns" className="border border-border bg-muted/40">Patterns</TabsTrigger>
                  <TabsTrigger value="playbook" className="border border-border bg-muted/40">Playbook</TabsTrigger>
                </TabsList>

                <TabsContent value="scripts">
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <MessageSquareQuote className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-medium text-foreground">Opening script, first 30 seconds</h3>
                        <p className="text-sm text-muted-foreground">Keep it permission-based, relevant, and short enough to survive a busy prospect.</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {openerScript.map((line, index) => (
                        <div key={line} className="flex gap-3 rounded-lg border border-border px-3 py-3 text-sm">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</div>
                          <p className="text-foreground">{line}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="objections">
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <Accordion type="single" collapsible className="w-full">
                      {objectionPlays.map((item) => (
                        <AccordionItem key={item.objection} value={item.objection}>
                          <AccordionTrigger className="text-left">{item.objection}</AccordionTrigger>
                          <AccordionContent className="space-y-3 text-sm">
                            <div>
                              <p className="text-xs uppercase tracking-widest text-muted-foreground">What it usually means</p>
                              <p className="mt-1 text-foreground">{item.whyItShowsUp}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-widest text-muted-foreground">Recommended response</p>
                              <p className="mt-1 rounded-lg border border-border bg-card px-3 py-3 text-foreground">{item.response}</p>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                </TabsContent>

                <TabsContent value="pipeline">
                  <div className="grid gap-3">
                    {pipelineGuidance.map((item) => (
                      <div key={item.stage} className="rounded-xl border border-border bg-background/60 p-4">
                        <div className="flex items-center gap-2">
                          <Handshake className="h-4 w-4 text-primary" />
                          <h3 className="font-medium text-foreground">{item.stage}</h3>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{item.focus}</p>
                        <Separator className="my-3" />
                        <div className="flex gap-2 text-sm text-foreground">
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <p>{item.repMove}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="patterns">
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <Workflow className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-medium text-foreground">Transcript-informed failure patterns</h3>
                        <p className="text-sm text-muted-foreground">Built from the transcript pipeline findings and cold-calling research, so reps can see how call behavior affects review quality and downstream CRM handoff.</p>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      {transcriptPatterns.map((pattern) => (
                        <div key={pattern.title} className="rounded-xl border border-border bg-card/70 p-4">
                          <h4 className="font-medium text-foreground">{pattern.title}</h4>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">What the transcripts flag</p>
                              <p className="mt-1 text-sm text-foreground">{pattern.signal}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Coach the rep to do this</p>
                              <p className="mt-1 text-sm text-foreground">{pattern.coaching}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Why it changes dialer outcomes</p>
                              <p className="mt-1 text-sm text-foreground">{pattern.dialerBehavior}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="playbook">
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <Target className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-medium text-foreground">Minimum standard for a solid shift</h3>
                        <p className="text-sm text-muted-foreground">If reps do these consistently, the dialer gets smarter and closers get better handoffs.</p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {playbookChecklist.map((item) => (
                        <div key={item} className="flex gap-3 rounded-lg border border-border px-3 py-3 text-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          <p className="text-foreground">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <Brain className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-widest">Coaching cues</span>
                </div>
                <CardTitle>Listen for these patterns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <p className="font-medium text-foreground">Weak opener</p>
                  <p className="mt-1">Rep sounds generic, asks for too much time, or explains the company before earning relevance.</p>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <p className="font-medium text-foreground">Missed follow-up trigger</p>
                  <p className="mt-1">Rep logs interest but does not record why the next touch matters now.</p>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <p className="font-medium text-foreground">Soft booking handoff</p>
                  <p className="mt-1">Rep secures time but skips desired outcome, stakeholder context, or show-rate reinforcement.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <TimerReset className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-widest">Next additions</span>
                </div>
                <CardTitle>Clear extension points</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Campaign-specific talk tracks per industry or offer</li>
                  <li>Manager scorecards and call review rubrics</li>
                  <li>New rep onboarding path with day-one to day-thirty milestones</li>
                  <li>Linked content from live dialer outcomes and pipeline stages</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
