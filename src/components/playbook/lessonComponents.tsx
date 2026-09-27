import { SetterScript } from "@/components/training/SetterScript";
import { SetterBoundaries } from "@/components/training/SetterBoundaries";
import { ColdCallOpener } from "@/components/training/ColdCallOpener";
import { ColdBrushOffs } from "@/components/training/ColdBrushOffs";
import { MindsetsPanel } from "@/components/training/MindsetsPanel";
import { ProblemsPanel } from "@/components/training/ProblemsPanel";
import { PainHooks } from "@/components/training/PainHooks";
import { TradeSegmentsPanel } from "@/components/training/TradeSegmentsPanel";
import { TradiePlaybook } from "@/components/training/TradiePlaybook";
import { ReframeLibrary } from "@/components/training/ReframeLibrary";
import { ObjectionBankPanel } from "@/components/training/ObjectionBankPanel";
import { WordTracks } from "@/components/training/WordTracks";
import { ServicesExplainer } from "@/components/training/ServicesExplainer";
import { CaseStudiesPanel } from "@/components/training/CaseStudiesPanel";
import { GlossaryPanel } from "@/components/training/GlossaryPanel";
import { WinningCallsLibrary } from "@/components/playbook/WinningCallsLibrary";
import { LearningCallsLibrary } from "@/components/playbook/LearningCallsLibrary";

/** Built-in panels a lesson can carry. Managers pick one in the lesson editor; video + notes render above it. */
export const COMPONENTS: Record<string, { label: string; render: () => React.ReactNode }> = {
  script: { label: "The script (four blocks + stage ticks)", render: () => <SetterScript /> },
  remit: { label: "Your remit (what goes to Bede)", render: () => <SetterBoundaries /> },
  opener: { label: "First 15 seconds (measured)", render: () => <ColdCallOpener /> },
  brushoffs: { label: "Brush-offs, ranked", render: () => <ColdBrushOffs /> },
  mindsets: { label: "Three mindsets + archetypes", render: () => <MindsetsPanel /> },
  problems: { label: "Five problems, bleeding neck, the gap", render: () => <ProblemsPanel /> },
  pain: { label: "Pain hooks you may use cold", render: () => <PainHooks /> },
  subtrades: { label: "Sub-trades (electrical + plumbing)", render: () => <TradeSegmentsPanel /> },
  tradie: { label: "How tradies talk", render: () => <TradiePlaybook /> },
  reframes: { label: "Reframes (four beats)", render: () => <ReframeLibrary /> },
  objections: { label: "Objection bank", render: () => <ObjectionBankPanel /> },
  lines: { label: "Bede's lines", render: () => <WordTracks /> },
  services: { label: "What we sell + Odin Analytics", render: () => <ServicesExplainer /> },
  proof: { label: "Proof & case studies", render: () => <CaseStudiesPanel /> },
  glossary: { label: "Glossary + scenarios", render: () => <GlossaryPanel /> },
  calls: { label: "Winning calls (recordings)", render: () => <WinningCallsLibrary /> },
  lost: { label: "Calls that didn't book", render: () => <LearningCallsLibrary /> },
};
