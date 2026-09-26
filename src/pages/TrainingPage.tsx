import { Brain, Building2, Trophy, UserX } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DQ_REASONS, AGENCY_SERVICES } from "@/data/constants";
import { WinningCallsLibrary } from "@/components/playbook/WinningCallsLibrary";
import { OnboardingPath } from "@/components/training/OnboardingPath";
import { SetterScriptPanel } from "@/components/training/SetterScriptPanel";
import { CoachPanel } from "@/components/training/CoachPanel";
import { StreamsPlaybook } from "@/components/training/StreamsPlaybook";
import { ManagerPlaybook } from "@/components/training/ManagerPlaybook";
import { ManagerMetrics } from "@/components/training/ManagerMetrics";
import { RealLinesPanel } from "@/components/training/RealLinesPanel";
import { RealDrillsPanel } from "@/components/training/RealDrillsPanel";
import { LeakPatternsPanel } from "@/components/training/LeakPatternsPanel";
import { ObjectionBankPanel } from "@/components/training/ObjectionBankPanel";
import { useCallLearnings } from "@/hooks/useCallLearnings";
import { useIsAdmin } from "@/hooks/useUserRole";

export default function TrainingPage() {
  const isAdmin = useIsAdmin();
  const { callsAnalysed, bookedAnalysed, winningLines, drills, stageLeaks } = useCallLearnings();
  const topLeak = stageLeaks[0];

  return (
    <AppLayout title="Training">
      <div className="mx-auto max-w-6xl space-y-6">
        <OnboardingPath />

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <Badge variant="secondary" className="w-fit text-[10px] uppercase tracking-widest">
                Built from your own calls
              </Badge>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Training</h1>
              <p className="text-sm text-muted-foreground">
                Everything below comes from calls this team has actually made — the lines that booked meetings, the moments
                calls fell over, and the objections you keep hearing. Nothing here is made up.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:w-[560px] lg:shrink-0">
              <Card className="bg-background/70">
                <CardHeader className="pb-1">
                  <CardDescription className="text-[10px] uppercase tracking-widest">Calls coached</CardDescription>
                  <CardTitle className="text-2xl">{callsAnalysed}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">{bookedAnalysed} of them booked</CardContent>
              </Card>
              <Card className="bg-background/70">
                <CardHeader className="pb-1">
                  <CardDescription className="text-[10px] uppercase tracking-widest">Winning lines</CardDescription>
                  <CardTitle className="text-2xl">{winningLines.length}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">Pulled from booked calls</CardContent>
              </Card>
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-1">
                  <CardDescription className="text-[10px] uppercase tracking-widest">Biggest leak</CardDescription>
                  <CardTitle className="text-base">{topLeak?.label ?? "Not enough data"}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {topLeak ? `${topLeak.share}% of calls break here first` : "Coaching still building up"}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <Brain className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-widest">Training modules</span>
            </div>
            <CardTitle>What to work on before your next shift</CardTitle>
            <CardDescription>Start with Real Calls and your Coach, then drill the lines and objections that keep costing bookings.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="real-calls" className="space-y-4">
              <TabsList className="grid h-auto grid-cols-2 gap-2 bg-transparent p-0 md:grid-cols-5">
                <TabsTrigger value="real-calls" className="border border-primary/40 bg-primary/5">
                  <Trophy className="mr-1.5 h-3.5 w-3.5" /> Real Calls
                </TabsTrigger>
                <TabsTrigger value="coach" className="border border-primary/40 bg-primary/5">
                  <Brain className="mr-1.5 h-3.5 w-3.5" /> Coach
                </TabsTrigger>
                <TabsTrigger value="lines" className="border border-border bg-muted/40">Lines that work</TabsTrigger>
                <TabsTrigger value="objections" className="border border-border bg-muted/40">Objections</TabsTrigger>
                <TabsTrigger value="drills" className="border border-border bg-muted/40">Drills</TabsTrigger>
                <TabsTrigger value="patterns" className="border border-border bg-muted/40">Where calls break</TabsTrigger>
                <TabsTrigger value="streams" className="border border-border bg-muted/40">Streams</TabsTrigger>
                <TabsTrigger value="definitions" className="border border-border bg-muted/40">Definitions</TabsTrigger>
                {isAdmin && <TabsTrigger value="manager" className="border border-border bg-muted/40">Manager</TabsTrigger>}
              </TabsList>

              <TabsContent value="real-calls">
                <div className="space-y-3">
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                    <h3 className="font-medium text-foreground">Learn from calls that actually turned into clients</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Every booked call is transcribed and recorded automatically. The ones badged{" "}
                      <span className="font-medium text-foreground">Showed &amp; Closed</span> ended as signed clients — read the
                      transcript, listen to the audio, then match what they do: the opener, the questions, how objections got
                      handled, and how the booking was locked in.
                    </p>
                  </div>
                  <WinningCallsLibrary />
                </div>
              </TabsContent>

              <TabsContent value="coach">
                <div className="space-y-3">
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                    <h3 className="font-medium text-foreground">Your personal AI coach</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Every answered call is compared against the calls that actually booked. The coach shows you the exact
                      moment each call was won or lost and what to say next time — in your own words, not a script.
                    </p>
                  </div>
                  <CoachPanel />
                </div>
              </TabsContent>

              <TabsContent value="lines">
                <RealLinesPanel />
              </TabsContent>

              <TabsContent value="objections">
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <h3 className="font-medium text-foreground">The objections you actually hear</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ranked by how often they come up on the phones, with the responses reps used and how often those calls
                      still booked.
                    </p>
                  </div>
                  <ObjectionBankPanel />
                </div>
              </TabsContent>

              <TabsContent value="drills">
                <RealDrillsPanel />
              </TabsContent>

              <TabsContent value="patterns">
                <LeakPatternsPanel />
              </TabsContent>

              <TabsContent value="streams">
                <StreamsPlaybook />
              </TabsContent>

              <TabsContent value="definitions">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <UserX className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-medium text-foreground">Disqualified (DQ) — what it actually means</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Every business we cold-call could theoretically use digital marketing. There are only
                          <span className="font-medium text-foreground"> two </span>
                          legitimate reasons to mark a lead Disqualified. Everything else is
                          <span className="font-medium text-foreground"> Not Interested </span>
                          (they can be re-approached later) or
                          <span className="font-medium text-foreground"> Do Not Call </span>
                          (they asked to be removed).
                        </p>
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <div className="space-y-3">
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
                    <div className="mb-3 flex items-start gap-3">
                      <Building2 className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-medium text-foreground">Existing Agency intel — why we capture it</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          A prospect already paying an agency has proven they'll invest in growth. That's higher intent than a
                          cold lead. Always ask, and record which services they buy so we can filter and re-target these leads.
                        </p>
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Services to tick</p>
                      <div className="grid grid-cols-2 gap-2">
                        {AGENCY_SERVICES.map((s) => (
                          <div key={s.value} className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground">
                            {s.label}
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Ask: "Just so I know — are you already running any SEO, Google Ads, or Meta ads at the moment?" If yes,
                        capture the agency name and any spend or contract details in the notes.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {isAdmin && (
                <TabsContent value="manager">
                  <div className="space-y-3">
                    <ManagerMetrics />
                    <ManagerPlaybook />
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>

        {drills.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {drills.length} coached calls are waiting in Drills — work through the ones tagged with your weakest stage first.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
