import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageSquareText } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CallLibrary } from "@/components/playbook/CallLibrary";
import { Classroom } from "@/components/playbook/Classroom";
import { CallsToReview } from "@/components/training/CallsToReview";
import { CommissionPanel } from "@/components/training/CommissionPanel";
import { MyCallReviews } from "@/components/training/MyCallReviews";
import { MyLoomReviews } from "@/components/training/MyLoomReviews";
import { OnboardingPath } from "@/components/training/OnboardingPath";
import { PracticeTab } from "@/components/training/PracticeTab";
import { RoleplayTrainer } from "@/components/training/RoleplayTrainer";
import { trainingTabFor, type TrainingTab } from "@/lib/trainingTabs";

/**
 * Training — the one page a rep learns on (Bede, 23 Nov 2026: Classroom and
 * Training merged). Calls to review comes first because it is the part with
 * something to do; the Classroom, call library and practice sit beside it.
 * /classroom and /playbook redirect here with their query intact.
 */
const TABS: Array<{ value: TrainingTab; label: string }> = [
  { value: "reviews", label: "Calls to review" },
  { value: "classroom", label: "Classroom" },
  { value: "library", label: "Call library" },
  { value: "practice", label: "Practice" },
  { value: "start", label: "First 14 days & pay" },
];

export default function TrainingPage() {
  const [params, setParams] = useSearchParams();
  const [roleplayOpen, setRoleplayOpen] = useState(false);
  const [scenario, setScenario] = useState("");
  const active = useMemo(() => trainingTabFor(params), [params]);

  const setTab = (value: string) => {
    // Each tab owns its own query; carrying one tab's into the next reopens the wrong thing later.
    setParams(new URLSearchParams({ tab: value }), { replace: true });
  };

  // Drill deep links: ?drill=<scenario> opens the roleplay trainer on it.
  const drill = params.get("drill");
  useEffect(() => {
    if (!drill) return;
    setScenario(drill);
    setRoleplayOpen(true);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("drill");
      next.set("tab", "practice");
      return next;
    }, { replace: true });
  }, [drill, setParams]);

  return (
    <AppLayout title="Training">
      <div className="mx-auto max-w-7xl">
        <Tabs value={active} onValueChange={setTab}>
          <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1">
            {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="reviews" className="space-y-6">
            <MyLoomReviews />
            <MyCallReviews />
            <CallsToReview />
          </TabsContent>
          <TabsContent value="classroom"><Classroom /></TabsContent>
          <TabsContent value="library"><CallLibrary /></TabsContent>
          <TabsContent value="practice">
            <PracticeTab onRoleplay={(q) => { setScenario(q); setRoleplayOpen(true); }} />
          </TabsContent>
          <TabsContent value="start" className="space-y-6">
            <OnboardingPath />
            <CommissionPanel />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={roleplayOpen} onOpenChange={setRoleplayOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-primary" /> Roleplay trainer</DialogTitle>
            <DialogDescription>Five hidden tradie personas, levels 1-5, milestone grading. Pass = clean process, not "did you book".</DialogDescription>
          </DialogHeader>
          <RoleplayTrainer key={scenario} initialScenario={scenario} />
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
