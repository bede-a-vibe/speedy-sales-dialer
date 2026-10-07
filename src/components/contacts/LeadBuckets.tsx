import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Lead buckets are stored as tags on the contact so they need no extra schema. */
export const LEAD_BUCKETS = ["Looking to sell", "Not ready yet", "No capacity"] as const;

export function LeadBuckets({ contactId, className }: { contactId: string; className?: string }) {
  const qc = useQueryClient();
  const key = ["lead-buckets", contactId];
  const { data: tags = [] } = useQuery({
    queryKey: key,
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("tags").eq("id", contactId).maybeSingle();
      if (error) throw error;
      return (data?.tags ?? []) as string[];
    },
  });

  const toggle = async (bucket: string) => {
    const next = tags.includes(bucket) ? tags.filter((t) => t !== bucket) : [...tags, bucket];
    qc.setQueryData(key, next);
    const { error } = await supabase.from("contacts").update({ tags: next }).eq("id", contactId);
    if (error) {
      qc.setQueryData(key, tags);
      toast.error(`Couldn't update bucket: ${error.message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ["contacts"] });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Buckets</span>
      {LEAD_BUCKETS.map((b) => {
        const on = tags.includes(b);
        return (
          <button
            key={b}
            type="button"
            onClick={() => toggle(b)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {on && <Check className="h-3 w-3" />}
            {b}
          </button>
        );
      })}
    </div>
  );
}
