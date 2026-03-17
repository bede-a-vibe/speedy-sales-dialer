import { useMemo } from "react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PipelineItemCard } from "@/components/pipelines/PipelineItemCard";
import { getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import { useUpdateContact } from "@/hooks/useContacts";
import {
  usePipelineItems,
  useSalesReps,
  useUpdatePipelineItem,
  type PipelineItemWithRelations,
} from "@/hooks/usePipelineItems";

function getRepLabel(displayName: string | null, email: string | null) {
  return displayName?.trim() || email || "Unassigned";
}

export default function PipelinesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "booked" ? "booked" : "follow_up";
  const { data: followUps = [], isLoading: followUpsLoading } = usePipelineItems("follow_up");
  const { data: booked = [], isLoading: bookedLoading } = usePipelineItems("booked");
  const { data: reps = [] } = useSalesReps();
  const updatePipelineItem = useUpdatePipelineItem();
  const updateContact = useUpdateContact();

  const repMap = useMemo(
    () => new Map(reps.map((rep) => [rep.user_id, getRepLabel(rep.display_name, rep.email)])),
    [reps],
  );

  const handleComplete = async (id: string) => {
    try {
      await updatePipelineItem.mutateAsync({ id, status: "completed" });
      toast.success("Pipeline item completed.");
    } catch {
      toast.error("Failed to complete pipeline item.");
    }
  };

  const handleAssign = async (id: string, userId: string) => {
    try {
      await updatePipelineItem.mutateAsync({ id, assigned_user_id: userId });
      toast.success("Rep updated.");
    } catch {
      toast.error("Failed to update rep.");
    }
  };

  const handleReschedule = async (id: string, iso: string) => {
    try {
      await updatePipelineItem.mutateAsync({ id, scheduled_for: iso });
      toast.success("Follow-up rescheduled.");
    } catch {
      toast.error("Failed to reschedule follow-up.");
    }
  };

  const handleBookedOutcome = async (
    item: PipelineItemWithRelations,
    outcome: AppointmentOutcomeValue,
    notes: string,
    scheduledFor?: string,
  ) => {
    try {
      if (outcome === "rescheduled") {
        if (!scheduledFor) {
          toast.error("Pick a new appointment day first.");
          return;
        }

        await updatePipelineItem.mutateAsync({
          id: item.id,
          appointment_outcome: "rescheduled",
          outcome_notes: notes,
          scheduled_for: scheduledFor,
          status: "open",
          completed_at: null,
        });

        await updateContact.mutateAsync({
          id: item.contact_id,
          status: "called",
          latest_appointment_outcome: "rescheduled",
          latest_appointment_scheduled_for: scheduledFor,
          latest_appointment_recorded_at: new Date().toISOString(),
        });

        toast.success("Appointment rescheduled.");
        return;
      }

      await updatePipelineItem.mutateAsync({
        id: item.id,
        appointment_outcome: outcome,
        outcome_notes: notes,
        status: "completed",
      });

      await updateContact.mutateAsync({
        id: item.contact_id,
        status: "called",
        latest_appointment_outcome: outcome,
        latest_appointment_scheduled_for: item.scheduled_for,
        latest_appointment_recorded_at: new Date().toISOString(),
      });

      toast.success(`Appointment marked ${getAppointmentOutcomeLabel(outcome)}.`);
    } catch {
      toast.error("Failed to update appointment outcome.");
    }
  };

  const renderItems = (items: PipelineItemWithRelations[], type: "follow_up" | "booked") => {
    if ((type === "follow_up" && followUpsLoading) || (type === "booked" && bookedLoading)) {
      return <div className="animate-pulse py-20 text-center text-sm font-mono text-muted-foreground">Loading...</div>;
    }

    if (items.length === 0) {
      return <div className="py-20 text-center text-sm text-muted-foreground">No open {type === "follow_up" ? "follow-ups" : "booked appointments"}.</div>;
    }

    return (
      <div className="space-y-3">
        {items.map((item) => (
          <PipelineItemCard
            key={item.id}
            item={item}
            repName={repMap.get(item.assigned_user_id) || "Unknown rep"}
            reps={reps}
            isSaving={updatePipelineItem.isPending || updateContact.isPending}
            onComplete={handleComplete}
            onAssign={handleAssign}
            onReschedule={type === "follow_up" ? handleReschedule : undefined}
            onRecordBookedOutcome={type === "booked" ? handleBookedOutcome : undefined}
          />
        ))}
      </div>
    );
  };

  return (
    <AppLayout title="Pipelines">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Appointment pipelines</h3>
            <p className="text-sm text-muted-foreground">Track open follow-ups, booked days, and final appointment results in one place.</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
            <span>{followUps.length} follow-ups</span>
            <span>{booked.length} booked</span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })}>
          <TabsList>
            <TabsTrigger value="follow_up">Follow-ups</TabsTrigger>
            <TabsTrigger value="booked">Booked</TabsTrigger>
          </TabsList>
          <TabsContent value="follow_up" className="mt-4">
            {renderItems(followUps, "follow_up")}
          </TabsContent>
          <TabsContent value="booked" className="mt-4">
            {renderItems(booked, "booked")}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
