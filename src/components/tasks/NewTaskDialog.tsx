import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { FollowUpMethodSelector } from "@/components/pipelines/FollowUpMethodSelector";
import {
  useCreatePipelineItem,
  useSalesReps,
  type FollowUpMethod,
} from "@/hooks/usePipelineItems";
import { useAuth } from "@/hooks/useAuth";

type MinimalContact = {
  id: string;
  business_name: string;
  contact_person: string | null;
  phone: string | null;
};

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: MinimalContact | null;
  onCreated?: () => void;
}

function combineDateTime(date: Date, time: string) {
  const [h, m] = (time || "09:00").split(":").map(Number);
  const next = new Date(date);
  next.setHours(h || 9, m || 0, 0, 0);
  return next;
}

function nextQuarterHour(base = new Date()) {
  const d = new Date(base);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0);
  return d;
}

export function NewTaskDialog({ open, onOpenChange, contact, onCreated }: NewTaskDialogProps) {
  const { user } = useAuth();
  const { data: reps = [] } = useSalesReps();
  const createTask = useCreatePipelineItem();

  const [method, setMethod] = useState<FollowUpMethod>("task");
  const [dueDate, setDueDate] = useState<Date | undefined>(() => nextQuarterHour());
  const [dueTime, setDueTime] = useState<string>(() => format(nextQuarterHour(), "HH:mm"));
  const [note, setNote] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");

  const [pickedContact, setPickedContact] = useState<MinimalContact | null>(contact ?? null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<MinimalContact[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPickedContact(contact ?? null);
    setMethod("task");
    setNote("");
    const d = nextQuarterHour();
    setDueDate(d);
    setDueTime(format(d, "HH:mm"));
    setAssignedTo(user?.id ?? "");
    setSearch("");
    setResults([]);
  }, [open, contact, user?.id]);

  useEffect(() => {
    if (contact || !open) return;
    const trimmed = search.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, business_name, contact_person, phone")
        .or(`business_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,contact_person.ilike.%${trimmed}%`)
        .limit(10);
      if (!cancelled) {
        setResults((data ?? []) as MinimalContact[]);
        setSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, contact, open]);

  const canSubmit = useMemo(
    () => !!pickedContact && !!dueDate && !!assignedTo && !createTask.isPending,
    [pickedContact, dueDate, assignedTo, createTask.isPending],
  );

  const handleSubmit = async () => {
    if (!pickedContact || !dueDate || !user) return;
    const scheduledFor = combineDateTime(dueDate, dueTime).toISOString();
    try {
      await createTask.mutateAsync({
        contact_id: pickedContact.id,
        pipeline_type: "follow_up",
        assigned_user_id: assignedTo,
        created_by: user.id,
        scheduled_for: scheduledFor,
        follow_up_method: method,
        notes: note.trim(),
        status: "open",
      });
      toast.success("Task created.");
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create task.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Schedule any follow-up: call, email, SMS, or general to-do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!contact ? (
            <div className="space-y-2">
              <Label>Contact</Label>
              {pickedContact ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{pickedContact.business_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {pickedContact.contact_person || pickedContact.phone || "No details"}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPickedContact(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by business, contact, or phone…"
                      className="pl-8"
                      autoFocus
                    />
                  </div>
                  {searching ? (
                    <p className="text-xs text-muted-foreground">Searching…</p>
                  ) : results.length > 0 ? (
                    <div className="max-h-48 overflow-auto rounded-md border border-border bg-background">
                      {results.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setPickedContact(r)}
                          className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">{r.business_name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {r.contact_person || r.phone || "—"}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : search.trim().length >= 2 ? (
                    <p className="text-xs text-muted-foreground">No matches.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Type at least 2 characters to search.</p>
                  )}
                </>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Type</Label>
            <FollowUpMethodSelector value={method} onChange={setMethod} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Due date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start font-normal", !dueDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assign to</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Pick rep" />
              </SelectTrigger>
              <SelectContent>
                {reps.map((r) => (
                  <SelectItem key={r.user_id} value={r.user_id}>
                    {r.display_name || r.email || "Unnamed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What needs to happen?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {createTask.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
