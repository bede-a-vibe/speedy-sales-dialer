import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Ref = { id: string; business_name: string };
type DmClash = Ref & { dm_name: string | null; dm_phone: string; dm_phone_verified: boolean; others: Ref[] };
type MainRow = Ref & { phone: string; quality: string | null; ghl_contact_id: string | null };
type Flagged = MainRow & { flagged_at: string | null };
type Audit = { dm_total: number; dm_confirmed: number; dm_clashes: DmClash[]; main_clashes: MainRow[][]; flagged: Flagged[] };

const last9 = (v: string) => v.replace(/\D/g, "").slice(-9);

export function NumberChecks() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["number-audit"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("number_audit" as any);
      if (error) throw error;
      return data as unknown as Audit;
    },
  });

  const run = async (fn: () => PromiseLike<{ error: any }>, ok: string) => {
    const { error } = await fn();
    if (error) return toast.error("Couldn't save that — try again.");
    toast.success(ok);
    qc.invalidateQueries({ queryKey: ["number-audit"] });
  };

  const removeDm = async (row: DmClash) => {
    const { data: c } = await supabase.from("contacts").select("dm_phone_blocklist").eq("id", row.id).maybeSingle();
    const list = Array.from(new Set([...(((c as any)?.dm_phone_blocklist as string[]) ?? []), last9(row.dm_phone)]));
    run(() => supabase.from("contacts").update({ dm_phone: null, dm_phone_type: null, dm_phone_verified: false, dm_phone_verified_at: null, dm_phone_blocklist: list } as any).eq("id", row.id), "Direct line removed and blocked for this lead.");
  };
  const setQuality = (id: string, quality: "confirmed" | "dead", ok: string) =>
    run(() => supabase.from("contacts").update({ phone_number_quality: quality }).eq("id", id), ok);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  if (error || !data) return <p className="text-sm text-destructive">Couldn't load number checks.</p>;

  const biz = (r: Ref) => <Link to={`/contacts/${r.id}`} className="font-medium text-foreground hover:underline">{r.business_name}</Link>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Direct lines confirmed" value={`${data.dm_confirmed} / ${data.dm_total}`} hint="Unconfirmed ones are never dialled automatically." />
        <Stat label="Direct lines on another business" value={data.dm_clashes.length} />
        <Stat label="Main numbers shared" value={data.main_clashes.length} hint="Often sister brands — check each." />
        <Stat label="Flagged wrong by reps" value={data.flagged.length} />
      </div>

      <Section title="Direct lines that belong to another business" empty={data.dm_clashes.length === 0}
        desc="The scraped decision-maker number also appears on a different business. It's usually wrong — remove it unless you've checked.">
        {data.dm_clashes.map((r) => (
          <Row key={r.id}>
            <div className="text-sm">
              {biz(r)} <span className="text-muted-foreground">— {r.dm_name ?? "DM"}</span> <span className="font-mono">{r.dm_phone}</span>
              <p className="text-xs text-muted-foreground">Also on: {r.others.map((o, i) => <span key={o.id}>{i ? ", " : ""}{biz(o)}</span>)}</p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => removeDm(r)}>Remove from this lead</Button>
          </Row>
        ))}
      </Section>

      <Section title="Main numbers shared by different businesses" empty={data.main_clashes.length === 0}
        desc="Same number on two business names. Fine if it's one owner with two brands. If a number belongs to someone else (GHL has had wrong numbers too), mark it wrong and it leaves the dialer.">
        {data.main_clashes.map((group) => (
          <div key={group[0].id} className="rounded-md border border-border p-3 space-y-2">
            <p className="font-mono text-sm">{group[0].phone}</p>
            {group.map((r) => (
              <Row key={r.id}>
                <div className="text-sm">{biz(r)}{!r.ghl_contact_id && <span className="ml-2 text-xs text-muted-foreground">not in GHL</span>}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setQuality(r.id, "confirmed", "Marked correct.")}>Correct</Button>
                  <Button size="sm" variant="destructive" onClick={() => setQuality(r.id, "dead", "Marked wrong — removed from the dialer.")}>Wrong number</Button>
                </div>
              </Row>
            ))}
          </div>
        ))}
      </Section>

      <Section title="Numbers reps flagged as wrong" empty={data.flagged.length === 0}
        desc="Calls logged as Wrong number, or numbers marked suspect. Find the right number and update the contact here and in GHL.">
        {data.flagged.map((r) => (
          <Row key={r.id}>
            <div className="text-sm">{biz(r)} <span className="font-mono text-muted-foreground">{r.phone}</span>
              {r.flagged_at && <span className="ml-2 text-xs text-muted-foreground">{new Date(r.flagged_at).toLocaleDateString("en-AU")}</span>}
              <span className="ml-2 text-xs capitalize text-muted-foreground">{r.quality}</span>
            </div>
            {r.quality !== "dead" && <Button size="sm" variant="destructive" onClick={() => setQuality(r.id, "dead", "Removed from the dialer.")}>Take out of dialer</Button>}
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold font-mono text-foreground">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
function Section({ title, desc, empty, children }: { title: string; desc: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div><h3 className="font-semibold text-foreground">{title}</h3><p className="text-sm text-muted-foreground">{desc}</p></div>
      {empty ? <p className="text-sm text-muted-foreground">Nothing to check.</p> : <div className="space-y-2">{children}</div>}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2">{children}</div>;
}
