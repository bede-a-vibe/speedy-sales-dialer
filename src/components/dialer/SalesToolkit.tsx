import { useState } from "react";
import { BookOpen, Mic, Shield, Wrench } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ObjectionHandler } from "@/components/dialer/ObjectionHandler";
import { VoicemailTemplates } from "@/components/dialer/VoicemailTemplates";
import { CallScriptPanel } from "@/components/dialer/CallScriptPanel";

interface SalesToolkitProps {
  /** Current contact's industry for script matching */
  contactIndustry?: string | null;
}

/**
 * Sales Toolkit — collapsible panel that houses all Fanatical Prospecting tools:
 * - Call Scripts (talk tracks)
 * - Objection Handlers
 * - Voicemail Templates
 *
 * Sits in the dialer's left column so reps have instant access during calls.
 */
export function SalesToolkit({ contactIndustry }: SalesToolkitProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isExpanded) {
    return (
      <button
        className="w-full rounded-lg border border-dashed border-primary/20 bg-primary/5 p-3 flex items-center justify-center gap-2 hover:bg-primary/10 transition-all"
        onClick={() => setIsExpanded(true)}
      >
        <Wrench className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-primary">
          Open Sales Toolkit
        </span>
        <span className="text-[9px] text-muted-foreground">
          Scripts • Objections • Voicemails
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Sales Toolkit
          </h3>
        </div>
        <button
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setIsExpanded(false)}
        >
          Collapse
        </button>
      </div>

      <Tabs defaultValue="scripts">
        <TabsList className="w-full mb-3">
          <TabsTrigger value="scripts" className="flex-1 gap-1.5 text-xs">
            <BookOpen className="h-3 w-3" />
            Scripts
          </TabsTrigger>
          <TabsTrigger value="objections" className="flex-1 gap-1.5 text-xs">
            <Shield className="h-3 w-3" />
            Objections
          </TabsTrigger>
          <TabsTrigger value="voicemails" className="flex-1 gap-1.5 text-xs">
            <Mic className="h-3 w-3" />
            Voicemails
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scripts">
          <CallScriptPanel contactIndustry={contactIndustry} />
        </TabsContent>

        <TabsContent value="objections">
          <ObjectionHandler />
        </TabsContent>

        <TabsContent value="voicemails">
          <VoicemailTemplates />
        </TabsContent>
      </Tabs>
    </div>
  );
}
