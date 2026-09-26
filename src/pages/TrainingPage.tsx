import { BookOpenText, Brain, CheckCircle2, ChevronRight, GraduationCap, Handshake, MessageSquareQuote, Swords, Target, Trophy, UserX, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DQ_REASONS, AGENCY_SERVICES } from "@/data/constants";
import { Building2 } from "lucide-react";
import { WinningCallsLibrary } from "@/components/playbook/WinningCallsLibrary";
import { OnboardingPath } from "@/components/training/OnboardingPath";
import { CoachPanel } from "@/components/training/CoachPanel";
import { ManagerPlaybook } from "@/components/training/ManagerPlaybook";
import { ManagerMetrics } from "@/components/training/ManagerMetrics";
import { RoleplayTrainer } from "@/components/training/RoleplayTrainer";
import { useIsAdmin } from "@/hooks/useUserRole";

const openerScript = [
  "Hi, it's {rep_name} from Odin Digital. Did I catch you at an okay time for 27 seconds?",
  "I was looking at {business_name} and noticed you already have demand coming in from {channel_or_local_area}.",
  "We help trade businesses turn more of that existing demand into booked jobs without adding admin overhead.",
  "Would it be crazy to ask two quick questions and see if it's worth a proper chat?",
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

const shiftStandards = [
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
  },
  {
    title: "Bad-time objections handled like real discovery",
    signal: "Calls drift when the prospect says they are busy but the rep keeps probing instead of locking better timing.",
    coaching: "Acknowledge the interruption, ask for the best callback window, and save the timing detail before ending the call.",
  },
  {
    title: "Good conversation, weak note handoff",
    signal: "Transcript summaries only help the team when the next action and pain point are clear enough to save into notes and CRM follow-up.",
    coaching: "Before ending the call, lock one concrete pain, one owner detail, and one next step you would be happy for another rep to inherit.",
  },
  {
    title: "Voicemail logged, recovery path missed",
    signal: "A voicemail outcome is weak if the message is long, pitch-heavy, or leaves no clean callback reason for the next touch.",
    coaching: "Keep voicemails under 30 seconds, give one reason to call back, and pair the outcome with a follow-up SMS or callback task when the workflow allows.",
  },
];

export default function TrainingPage() {
  const isAdmin = useIsAdmin();
  return (
    <AppLayout title="Training">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <GraduationCap className="h-6 w-6 text-primary" /> Training
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Learn by doing: dial, read your coaching, fix one thing, drill it. Everything on this page is built from your real calls.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/playbook">
              <BookOpenText className="mr-1.5 h-4 w-4" /> Open the Playbook
            </Link>
          </Button>
        </div>

        {/* 1. Your path */}
        <OnboardingPath />

        {/* 2. Your coach */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Your coach</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Every answered call is compared against the calls that actually booked. You get the exact moment each call
            was won or lost, the better path, and what to say next time — then you drill it below.
          </p>
          <CoachPanel />
        </section>

        {/* 3. Practise */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Practise</h2>
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Roleplay trainer</CardTitle>
              <CardDescription>
                Five hidden tradie personas, levels 1-5, milestone grading. Pass = clean process, not "did you book".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RoleplayTrainer />
            </CardContent>
          </Card>
        </section>

        {/* 4. Real calls */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Real calls that signed clients</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Read the transcript, listen to the audio, then watch the closing session. Match what they do: the opener,
            the discovery questions, how objections got handled, and how the booking was locked in.
          </p>
          <WinningCallsLibrary />
        </section>

        {/* 5. Reference */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <BookOpenText className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Reference</h2>
          </div>
          <Card>
            <CardContent className="pt-4">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="scripts">
                  <AccordionTrigger className="text-left">
                    <span className="flex items-center gap-2"><MessageSquareQuote className="h-4 w-4 text-primary" /> Scripts &amp; recovery plays</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-5 pt-2">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">Opening script, first 30 seconds</h3>
                      <div className="mt-2 space-y-2">
                        {openerScript.map((line, index) => (
                          <div key={line} className="flex gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</div>
                            <p className="text-foreground">{line}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium text-foreground">If they say it is a bad time</h3>
                      <p className="mt-1 text-xs text-muted-foreground">The goal is not to save the pitch. The goal is to save the next conversation.</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {badTimeRecovery.map((line, index) => (
                          <div key={line} className="flex gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</div>
                            <p className="text-foreground">{line}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium text-foreground">If voicemail picks up</h3>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {voicemailRecovery.map((line, index) => (
                          <div key={line} className="flex gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</div>
                            <p className="text-foreground">{line}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="definitions">
                  <AccordionTrigger className="text-left">
                    <span className="flex items-center gap-2"><UserX className="h-4 w-4 text-primary" /> Disposition definitions</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-2">
                    <div className="rounded-xl border border-border bg-background/60 p-4">
                      <h3 className="text-sm font-medium text-foreground">Disqualified (DQ) — what it actually means</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Every business we cold-call could theoretically use digital marketing. There are only
                        <span className="font-medium text-foreground"> two </span>
                        legitimate reasons to mark a lead Disqualified. Everything else is
                        <span className="font-medium text-foreground"> Not Interested </span>
                        (they can be re-approached later) or
                        <span className="font-medium text-foreground"> Do Not Call </span>
                        (they asked to be removed).
                      </p>
                      <div className="mt-3 space-y-2">
                        {DQ_REASONS.map((r) => (
                          <div key={r.value} className="rounded-lg border border-border bg-card p-3">
                            <p className="text-sm font-medium text-foreground">{r.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        Wrong industry, out of area, bad fit, duplicates → these are
                        <span className="font-medium text-foreground"> not </span>
                        DQ reasons. Use Not Interested or leave a note.
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background/60 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-medium text-foreground">Existing agency intel — why we capture it</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        A prospect already paying an agency has proven they'll invest in growth. That's higher intent
                        than a cold lead. Always ask, and record which services they buy so we can filter and re-target.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {AGENCY_SERVICES.map((s) => (
                          <div key={s.value} className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground">
                            {s.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="pipeline">
                  <AccordionTrigger className="text-left">
                    <span className="flex items-center gap-2"><Handshake className="h-4 w-4 text-primary" /> Pipeline guidance</span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="grid gap-3">
                      {pipelineGuidance.map((item) => (
                        <div key={item.stage} className="rounded-xl border border-border bg-background/60 p-4">
                          <h3 className="text-sm font-medium text-foreground">{item.stage}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{item.focus}</p>
                          <div className="mt-2 flex gap-2 text-sm text-foreground">
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <p>{item.repMove}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="patterns">
                  <AccordionTrigger className="text-left">
                    <span className="flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" /> Common failure patterns</span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="grid gap-3">
                      {transcriptPatterns.map((pattern) => (
                        <div key={pattern.title} className="rounded-xl border border-border bg-card/70 p-4">
                          <h4 className="text-sm font-medium text-foreground">{pattern.title}</h4>
                          <div className="mt-2 grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">What the transcripts flag</p>
                              <p className="mt-1 text-sm text-foreground">{pattern.signal}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Coach the rep to do this</p>
                              <p className="mt-1 text-sm text-foreground">{pattern.coaching}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="standards">
                  <AccordionTrigger className="text-left">
                    <span className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Minimum standard for a solid shift</span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="grid gap-2 md:grid-cols-2">
                      {shiftStandards.map((item) => (
                        <div key={item} className="flex gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          <p className="text-foreground">{item}</p>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </section>

        {/* 6. Manager (admins only) */}
        {isAdmin && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">Manager</Badge>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Team coaching</h2>
            </div>
            <ManagerMetrics />
            <ManagerPlaybook />
          </section>
        )}
      </div>
    </AppLayout>
  );
}
