import { ArrowRight, BookOpenText, Brain, CheckCircle2, ChevronRight, ClipboardCheck, Database, Handshake, MessageSquareQuote, Target, TimerReset, Workflow } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { callReviewRubric, managerCoachingTasks, managerTaskSnapshot, objectionEventDrafts, reviewDraftSnapshot, reviewPackets, reviewQueueSnapshot, reviewSubmissionDrafts } from "@/lib/trainingReview";

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
    whyItShowsUp: "Timing is genuinely bad. Treat it as a scheduling moment, not a cue to push through discovery.",
    response: "No worries. When are you usually easiest to catch, later today or tomorrow? I only need 2 minutes, and I'll make a note so the next call lands at a better time.",
  },
];

const badTimeRecovery = [
  "Acknowledge it fast: 'No worries, sounds like I caught you mid-run.'",
  "Do not force discovery. Earn the callback instead of trying to rescue the whole pitch.",
  "Ask for a specific callback window and save it before ending the call.",
  "If they will not commit, finish cleanly and requeue with the best timing clue you learned.",
];

const voicemailRecovery = [
  "Keep it under 30 seconds and lead with one concrete reason for calling back.",
  "Use local or trade-specific context so the next touch does not sound generic.",
  "End with one clean CTA: call back, reply to SMS, or expect a short follow-up at a named time.",
  "Log the callback angle and next attempt timing so the next rep builds on the message instead of repeating it.",
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
    title: "Bad-time objections handled like real discovery",
    signal: "Calls drift when the prospect says they are busy but the rep keeps probing instead of locking better timing.",
    coaching: "Acknowledge the interruption, ask for the best callback window, and save the timing detail before ending the call.",
    dialerBehavior: "Clean callback timing is more valuable than squeezing in one rushed question that produces no usable follow-up path.",
  },
  {
    title: "Good conversation, weak note handoff",
    signal: "Transcript summaries only help the team when the next action and pain point are clear enough to save into notes and CRM follow-up.",
    coaching: "Before ending the call, lock one concrete pain, one owner detail, and one next step you would be happy for another rep to inherit.",
    dialerBehavior: "Write notes that can survive a handoff to the closer or the next caller without replaying the full call.",
  },
  {
    title: "Voicemail logged, recovery path missed",
    signal: "A voicemail outcome is weak if the message is long, pitch-heavy, or leaves no clean callback reason for the next touch.",
    coaching: "Keep voicemails under 30 seconds, give one reason to call back, and pair the outcome with a follow-up SMS or callback task when the workflow allows.",
    dialerBehavior: "Voicemail is not a completed conversation, it is a recovery step that should feed the next attempt with better timing and context.",
  },
  {
    title: "Contact not ready for CRM push",
    signal: "Pipeline findings showed notes can be lost downstream when the contact record is incomplete, even if the call itself was useful.",
    coaching: "Confirm the right contact, best number, and role while you still have the prospect live, especially on trades where mobiles matter.",
    dialerBehavior: "Clean contact capture improves both future dialing and whether transcript learnings make it into the rest of the workflow.",
  },
];


const transcriptDrills = [
  {
    title: "Bad-time objection, rescued properly",
    skill: "Timing recovery",
    weakClip: [
      "Prospect: I'm on a job, mate, now's not great.",
      "Rep: Totally, this will only take a minute. How are you getting work right now?",
      "Prospect: I said I'm busy.",
    ],
    strongClip: [
      "Prospect: I'm on a job, mate, now's not great.",
      "Rep: No worries, sounds like I caught you mid-run. When are you usually easiest to catch, after 3 or first thing tomorrow?",
      "Prospect: After 4 is better.",
      "Rep: Perfect, I'll ring after 4 and keep it tight.",
    ],
    coachingPoint: "Once the prospect says it is a bad time, stop trying to win discovery. Win the callback window.",
    crmHandoff: "Save the callback time and note that the prospect was working, not uninterested.",
  },
  {
    title: "Send-me-info turned into real diagnosis",
    skill: "Objection pivot",
    weakClip: [
      "Prospect: Just send me something.",
      "Rep: Sure, what's your email?",
      "Prospect: info@business.com",
    ],
    strongClip: [
      "Prospect: Just send me something.",
      "Rep: Happy to. So I send the right thing, are you trying to improve lead flow, quote conversion, or follow-up speed most right now?",
      "Prospect: Probably follow-up, to be honest.",
      "Rep: That's helpful. What's breaking there at the moment?",
    ],
    coachingPoint: "Treat send-me-info as time protection, not real interest. Earn one useful detail before the call ends.",
    crmHandoff: "Record the specific problem so the follow-up email or next call is not generic.",
  },
  {
    title: "Voicemail that earns the next touch",
    skill: "Voicemail recovery",
    weakClip: [
      "Rep voicemail: Hi, it's Sam from SalesDialer calling about helping your business grow with marketing, websites, SEO, paid ads and more. Call me back when you can...",
    ],
    strongClip: [
      "Rep voicemail: G'day, it's Sam. Quick one, I noticed a gap that could help you book more plumbing jobs in Penrith without adding office admin. Call me back on 04xx xxx xxx and I'll keep it brief.",
    ],
    coachingPoint: "Short beats clever. Leave one reason to call back, then tee up the next attempt with an SMS or callback task.",
    crmHandoff: "Mark it as voicemail plus the callback angle you used, so the next rep does not repeat the same generic message.",
  },
  {
    title: "Booked call with usable handoff",
    skill: "Close and notes",
    weakClip: [
      "Rep: Sweet, let's book something in.",
      "Prospect: Yep.",
      "Rep: Done, talk then.",
    ],
    strongClip: [
      "Rep: Great, I've got you for Thursday at 2:30.",
      "Rep: We'll focus on missed-call follow-up and slow quote turnaround, yeah?",
      "Prospect: Yep, that's the main issue.",
      "Rep: Perfect. Best mobile for the reminder is still 04xx xxx xxx?",
    ],
    coachingPoint: "A booking only helps if the closer can see the pain, the owner, and the clean contact path instantly.",
    crmHandoff: "Capture the agreed agenda, confirmed mobile, and who is attending before ending the call.",
  },
];

const objectionEventPacketMap: Record<string, string> = {
  "obj-bad-time-001": "bad-time-recovery",
  "obj-send-info-001": "send-info-diagnosis",
};

const coachingSpotlights = objectionEventDrafts.map((event) => {
  const packet = reviewPackets.find((candidate) => candidate.id === objectionEventPacketMap[event.id]);
  const reviewDraft = reviewSubmissionDrafts.find((draft) => draft.packetId === packet?.id);
  const managerTask = managerCoachingTasks.find((task) => task.packetId === packet?.id);

  return {
    event,
    packet,
    reviewDraft,
    managerTask,
  };
});

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

        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <Badge variant="secondary" className="w-fit text-[10px] uppercase tracking-widest">
                New coaching artifacts, surfaced
              </Badge>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">From objection event to coaching action in one glance</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Reps and managers can now see the objection evidence, linked review packet, and next coaching action together instead of hunting across tabs.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Built from the typed objection, review, and task drafts already on the page.</p>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {coachingSpotlights.map(({ event, packet, reviewDraft, managerTask }) => (
              <div key={event.id} className="rounded-xl border border-border bg-card/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{event.objectionType}</Badge>
                  <Badge variant={event.coachingVerdict === "Strong" ? "default" : "outline"}>{event.coachingVerdict}</Badge>
                  {managerTask ? <Badge variant={managerTask.priority === "High" ? "destructive" : "outline"}>{managerTask.workflowStatus}</Badge> : null}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_auto_1fr_auto_1fr] lg:items-start">
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">What happened</p>
                    <p className="mt-2 text-sm text-foreground">{event.prospectWording}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{event.repResponse}</p>
                  </div>
                  <div className="hidden lg:flex h-full items-center justify-center text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Review packet</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{packet?.trigger ?? "No linked packet yet"}</p>
                    {packet ? <p className="mt-2 text-xs text-muted-foreground">Rep action: {packet.repAction}</p> : null}
                  </div>
                  <div className="hidden lg:flex h-full items-center justify-center text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Coach next</p>
                    <p className="mt-2 text-sm text-foreground">{managerTask?.summary ?? reviewDraft?.coachingActions[0] ?? event.coachingNote}</p>
                    {reviewDraft ? <p className="mt-2 text-xs text-muted-foreground">Latest review: {reviewDraft.repName} scored {reviewDraft.overallScore}.</p> : null}
                  </div>
                </div>
              </div>
            ))}
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
                <TabsList className="grid h-auto grid-cols-2 gap-2 bg-transparent p-0 md:grid-cols-7">
                  <TabsTrigger value="scripts" className="border border-border bg-muted/40">Scripts</TabsTrigger>
                  <TabsTrigger value="objections" className="border border-border bg-muted/40">Objections</TabsTrigger>
                  <TabsTrigger value="pipeline" className="border border-border bg-muted/40">Pipeline</TabsTrigger>
                  <TabsTrigger value="patterns" className="border border-border bg-muted/40">Patterns</TabsTrigger>
                  <TabsTrigger value="examples" className="border border-border bg-muted/40">Examples</TabsTrigger>
                  <TabsTrigger value="reviews" className="border border-border bg-muted/40">Reviews</TabsTrigger>
                  <TabsTrigger value="packets" className="border border-border bg-muted/40">Packets</TabsTrigger>
                  <TabsTrigger value="playbook" className="border border-border bg-muted/40">Playbook</TabsTrigger>
                </TabsList>

                <TabsContent value="scripts">
                  <div className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
                    <div>
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

                    <Separator />

                    <div>
                      <h3 className="font-medium text-foreground">If they say it is a bad time</h3>
                      <p className="mt-1 text-sm text-muted-foreground">The goal is not to save the pitch. The goal is to save the next conversation.</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {badTimeRecovery.map((line, index) => (
                          <div key={line} className="flex gap-3 rounded-lg border border-border px-3 py-3 text-sm">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</div>
                            <p className="text-foreground">{line}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="font-medium text-foreground">If voicemail picks up</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Voicemail is not a dead end. It should create a cleaner next touch for the dialer, not just a logged outcome.</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {voicemailRecovery.map((line, index) => (
                          <div key={line} className="flex gap-3 rounded-lg border border-border px-3 py-3 text-sm">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</div>
                            <p className="text-foreground">{line}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <p className="text-[10px] uppercase tracking-widest text-emerald-700">Recommended flow</p>
                        <p className="mt-2 text-sm text-foreground">Leave one local reason to call back, queue the next attempt with the same angle, and send a short SMS only when the workflow permits. That gives the next rep context instead of starting cold again.</p>
                      </div>
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

                <TabsContent value="examples">
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <MessageSquareQuote className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-medium text-foreground">Bad-vs-good transcript drills</h3>
                        <p className="text-sm text-muted-foreground">Short call snippets reps and managers can use to spot drift fast and coach the next better move.</p>
                      </div>
                    </div>
                    <div className="grid gap-4">
                      {transcriptDrills.map((drill) => (
                        <div key={drill.title} className="rounded-xl border border-border bg-card/70 p-4">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <h4 className="font-medium text-foreground">{drill.title}</h4>
                            <Badge variant="outline" className="w-fit">{drill.skill}</Badge>
                          </div>
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                              <p className="text-[10px] uppercase tracking-widest text-red-600">Weak clip</p>
                              <div className="mt-2 space-y-2 text-sm text-foreground">
                                {drill.weakClip.map((line) => (
                                  <p key={line}>{line}</p>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                              <p className="text-[10px] uppercase tracking-widest text-emerald-600">Better clip</p>
                              <div className="mt-2 space-y-2 text-sm text-foreground">
                                {drill.strongClip.map((line) => (
                                  <p key={line}>{line}</p>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Coach to this</p>
                              <p className="mt-1 text-sm text-foreground">{drill.coachingPoint}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">CRM and follow-up standard</p>
                              <p className="mt-1 text-sm text-foreground">{drill.crmHandoff}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="reviews">
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <ClipboardCheck className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-medium text-foreground">Transcript-to-coaching review rubric</h3>
                        <p className="text-sm text-muted-foreground">A simple scorecard managers can use while reading transcripts so coaching stays consistent across reps and shifts.</p>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      {callReviewRubric.map((item) => (
                        <div key={item.category} className="rounded-xl border border-border bg-card/70 p-4">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <h4 className="font-medium text-foreground">{item.category}</h4>
                            <Badge variant="outline" className="w-fit">{item.weight}</Badge>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Strong rep behavior</p>
                              <p className="mt-1 text-sm text-foreground">{item.strong}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Coach when this shows up</p>
                              <p className="mt-1 text-sm text-foreground">{item.weak}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Transcript look-fors</p>
                              <ul className="mt-1 space-y-1 text-sm text-foreground">
                                {item.transcriptLookFors.map((lookFor) => (
                                  <li key={lookFor} className="flex gap-2">
                                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                    <span>{lookFor}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="packets">
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <Database className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-medium text-foreground">Backend-ready review packets</h3>
                        <p className="text-sm text-muted-foreground">A spec-shaped bridge between transcript review, rep coaching, and CRM capture. Each packet can map cleanly to a future review record, rule, or task generator.</p>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      {reviewPackets.map((packet) => (
                        <div key={packet.id} className="rounded-xl border border-border bg-card/70 p-4">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <h4 className="font-medium text-foreground">{packet.trigger}</h4>
                            <Badge variant="outline" className="w-fit">{packet.linkedModule}</Badge>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Review stage</p>
                              <p className="mt-1 text-sm text-foreground">{packet.stage}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Manager prompt</p>
                              <p className="mt-1 text-sm text-foreground">{packet.managerPrompt}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Rep action</p>
                              <p className="mt-1 text-sm text-foreground">{packet.repAction}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Required CRM capture</p>
                              <p className="mt-1 text-sm text-foreground">{packet.crmRequirement}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="playbook">
                  <div className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
                    <div className="flex items-start gap-3">
                      <Database className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-medium text-foreground">Objection events flowing into training</h3>
                        <p className="text-sm text-muted-foreground">The same transcript pass should create structured objection events that can feed coaching, drills, and review queues, not just CRM notes.</p>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      {objectionEventDrafts.map((event) => (
                        <div key={event.id} className="rounded-lg border border-border bg-card/70 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{event.objectionType}</Badge>
                            <Badge variant={event.coachingVerdict === "Strong" ? "default" : "outline"}>{event.coachingVerdict}</Badge>
                            <Badge variant="outline">{event.outcome}</Badge>
                          </div>
                          <div className="mt-3 space-y-2 text-sm">
                            <p><span className="font-medium text-foreground">Prospect:</span> <span className="text-muted-foreground">{event.prospectWording}</span></p>
                            <p><span className="font-medium text-foreground">Rep:</span> <span className="text-muted-foreground">{event.repResponse}</span></p>
                            <p><span className="font-medium text-foreground">Coaching:</span> <span className="text-muted-foreground">{event.coachingNote}</span></p>
                            <p><span className="font-medium text-foreground">Evidence:</span> <span className="text-muted-foreground">{event.evidence.join(" ")}</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

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
                  <span className="text-[10px] uppercase tracking-widest">Backend-ready review snapshot</span>
                </div>
                <CardTitle>Review queue coverage</CardTitle>
                <CardDescription>Structured training review data now lives in a typed module, ready to feed future persistence and automation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Packets</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{reviewQueueSnapshot.packetCount}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Stages</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{reviewQueueSnapshot.stageCount}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Modules</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{reviewQueueSnapshot.moduleCount}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">CRM fields surfaced by current packets</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {reviewQueueSnapshot.crmFields.map((field) => (
                      <Badge key={field} variant="outline">{field}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <Brain className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-widest">Review payload preview</span>
                </div>
                <CardTitle>Manager review drafts</CardTitle>
                <CardDescription>Sample typed review records that can map to a future backend table, queue, or coaching task worker.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Drafts</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{reviewDraftSnapshot.draftCount}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Avg score</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{reviewDraftSnapshot.averageScore}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Needs intervention: {reviewDraftSnapshot.outcomes["Needs intervention"]}</Badge>
                  <Badge variant="outline">Coach next shift: {reviewDraftSnapshot.outcomes["Coach next shift"]}</Badge>
                  <Badge variant="outline">Ready to reinforce: {reviewDraftSnapshot.outcomes["Ready to reinforce"]}</Badge>
                </div>
                <div className="space-y-3">
                  {reviewSubmissionDrafts.map((draft) => (
                    <div key={draft.id} className="rounded-lg border border-border bg-background/70 p-3 text-sm">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-foreground">{draft.repName}</p>
                          <p className="text-xs text-muted-foreground">Packet {draft.packetId} • {draft.outcome}</p>
                        </div>
                        <Badge variant="secondary">Score {draft.overallScore}</Badge>
                      </div>
                      <div className="mt-3 grid gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Coaching actions</p>
                          <ul className="mt-1 space-y-1 text-muted-foreground">
                            {draft.coachingActions.map((action) => (
                              <li key={action} className="flex gap-2">
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                <span>{action}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Required CRM fields</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {draft.requiredCrmFields.map((field) => (
                              <Badge key={field} variant="outline">{field}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <Workflow className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-widest">Manager workflow preview</span>
                </div>
                <CardTitle>Coaching task queue</CardTitle>
                <CardDescription>Derived manager tasks now mirror a persistence-ready queue payload without needing a schema change first.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Tasks</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{managerTaskSnapshot.taskCount}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Owners</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{managerTaskSnapshot.ownerRoles.join(" • ")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">High: {managerTaskSnapshot.priorities.High}</Badge>
                  <Badge variant="outline">Medium: {managerTaskSnapshot.priorities.Medium}</Badge>
                  <Badge variant="outline">Low: {managerTaskSnapshot.priorities.Low}</Badge>
                </div>
                <div className="space-y-3">
                  {managerCoachingTasks.map((task) => (
                    <div key={task.id} className="rounded-lg border border-border bg-background/70 p-3 text-sm">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-foreground">{task.repName}</p>
                          <p className="text-xs text-muted-foreground">{task.workflowStatus} • {task.dueLabel}</p>
                        </div>
                        <Badge variant={task.priority === "High" ? "destructive" : "secondary"}>{task.priority}</Badge>
                      </div>
                      <p className="mt-3 text-muted-foreground">{task.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline">Owner: {task.ownerRole}</Badge>
                        <Badge variant="outline">Module: {task.linkedModule}</Badge>
                        {task.requiredCrmFields.map((field) => (
                          <Badge key={`${task.id}-${field}`} variant="outline">{field}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
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
                  <li>More transcript clip packs by industry, offer, and rep tenure</li>
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
