import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Radio, RotateCcw, RefreshCw, Download, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { AREA_CODE_TO_REGION_LABEL, type AuAreaCode } from "@/lib/callingCompliance";

const MAX_POOL_SIZE = 8;
const ROTATION_INTERVAL = 50;

function deriveAreaCode(e164: string): AuAreaCode | null {
  if (/^\+614/.test(e164)) return "04";
  if (/^\+612/.test(e164)) return "02";
  if (/^\+613/.test(e164)) return "03";
  if (/^\+617/.test(e164)) return "07";
  if (/^\+618/.test(e164)) return "08";
  return null;
}

// Accepts E.164 (+61...) or Australian mobile / landline forms; we normalize to E.164.
function normalizeToE164(raw: string): string | null {
  const trimmed = raw.trim().replace(/[\s()-]/g, "");
  if (!trimmed) return null;
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  // AU mobile 04xxxxxxxx → +614xxxxxxxx
  if (/^04\d{8}$/.test(trimmed)) return `+61${trimmed.slice(1)}`;
  // AU landline 0[2378]xxxxxxxx → +61[2378]xxxxxxxx
  if (/^0[2378]\d{8}$/.test(trimmed)) return `+61${trimmed.slice(1)}`;
  return null;
}

interface PoolRow {
  id: string;
  user_id: string;
  phone_number: string;
  label: string | null;
  position: number;
  is_active: boolean;
  owned_attested: boolean;
  attested_at: string | null;
  area_code: string | null;
  region: string | null;
}

interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface Settings {
  user_id: string;
  rotation_dial_count: number | null;
}

export function CallerIdRotationManager({ profiles }: { profiles: Profile[] }) {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [newPhone, setNewPhone] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newAttested, setNewAttested] = useState(false);

  const { data: pool = [], isLoading: poolLoading } = useQuery({
    queryKey: ["caller-id-pool-admin", selectedUserId],
    enabled: !!selectedUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caller_id_pool")
        .select("id, user_id, phone_number, label, position, is_active, owned_attested, attested_at, area_code, region")
        .eq("user_id", selectedUserId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PoolRow[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["dialpad-settings-for-rotation", selectedUserId],
    enabled: !!selectedUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dialpad_settings")
        .select("user_id, rotation_dial_count")
        .eq("user_id", selectedUserId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Settings | null;
    },
  });

  // Only numbers that are BOTH active AND owned-attested are eligible for
  // rotation — this is the compliance guard against blank / unattested CLI.
  const activePool = useMemo(
    () => pool.filter((p) => p.is_active && p.owned_attested),
    [pool],
  );
  const rotationCount = settings?.rotation_dial_count ?? 0;
  const activeIndex = activePool.length > 0
    ? Math.floor(rotationCount / ROTATION_INTERVAL) % activePool.length
    : 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["caller-id-pool-admin", selectedUserId] });
    qc.invalidateQueries({ queryKey: ["caller-id-pool", selectedUserId] });
  };

  const addNumber = useMutation({
    mutationFn: async () => {
      const e164 = normalizeToE164(newPhone);
      if (!e164) throw new Error("Enter a valid E.164 or Australian phone number.");
      if (pool.length >= MAX_POOL_SIZE) throw new Error(`Pool cap is ${MAX_POOL_SIZE} numbers per rep.`);
      if (!newAttested) throw new Error("You must confirm we own this number before adding it to rotation.");
      const nextPosition = pool.length === 0 ? 0 : Math.max(...pool.map((p) => p.position)) + 1;
      const { data: authData } = await supabase.auth.getUser();
      const areaCode = deriveAreaCode(e164);
      const { error } = await supabase.from("caller_id_pool").insert({
        user_id: selectedUserId,
        phone_number: e164,
        label: newLabel.trim() || null,
        position: nextPosition,
        is_active: true,
        owned_attested: true,
        attested_at: new Date().toISOString(),
        area_code: areaCode,
        region: areaCode ? AREA_CODE_TO_REGION_LABEL[areaCode] : null,
        created_by: authData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caller ID added to rotation.");
      setNewPhone("");
      setNewLabel("");
      setNewAttested(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add number."),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("caller_id_pool").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error("Failed to update."),
  });

  const toggleAttested = useMutation({
    mutationFn: async ({ id, owned_attested }: { id: string; owned_attested: boolean }) => {
      const { error } = await supabase
        .from("caller_id_pool")
        .update({
          owned_attested,
          attested_at: owned_attested ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error("Failed to update attestation."),
  });

  const removeNumber = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caller_id_pool").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed.");
      invalidate();
    },
    onError: () => toast.error("Failed to remove."),
  });

  const swapPositions = useMutation({
    mutationFn: async ({ a, b }: { a: PoolRow; b: PoolRow }) => {
      const { error: e1 } = await supabase.from("caller_id_pool").update({ position: b.position }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("caller_id_pool").update({ position: a.position }).eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: invalidate,
    onError: () => toast.error("Failed to reorder."),
  });

  const resetCounter = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("dialpad_settings")
        .update({ rotation_dial_count: 0 })
        .eq("user_id", selectedUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rotation counter reset.");
      qc.invalidateQueries({ queryKey: ["dialpad-settings-for-rotation", selectedUserId] });
      qc.invalidateQueries({ queryKey: ["caller-id-rotation-count", selectedUserId] });
    },
    onError: () => toast.error("Failed to reset counter."),
  });

  // ---- Dialpad reserved-number pool (admin, via the dialpad edge function) ----
  const [reservedOpen, setReservedOpen] = useState(false);
  const reservedQuery = useQuery({
    queryKey: ["dialpad-reserved-numbers"],
    enabled: reservedOpen,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("dialpad", { body: { action: "list_dialpad_numbers" } });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Dialpad request failed");
      return data as {
        available: Array<{ number: string; area_code?: string | null; type?: string | null; status?: string | null }>;
        users: Array<{ user_id: string; dialpad_user_id: string; primary_number: string | null; ok: boolean; phone_numbers: string[]; display_name: string | null }>;
      };
    },
  });
  const invokeDialpad = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("dialpad", { body });
    if (error) throw error;
    if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Dialpad request failed");
    return data;
  };
  const syncFromDialpad = useMutation({
    mutationFn: () => invokeDialpad({ action: "sync_caller_id_pool", user_id: selectedUserId }),
    onSuccess: (data) => {
      const row = data?.summary?.[0];
      toast.success(row?.ok ? `Synced: ${row.added} added, ${row.reactivated} reactivated, ${row.deactivated} deactivated.` : "Synced.");
      invalidate();
      qc.invalidateQueries({ queryKey: ["dialpad-reserved-numbers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed."),
  });
  const assignFromDialpad = useMutation({
    mutationFn: (number: string) => invokeDialpad({ action: "assign_dialpad_number", number, user_id: selectedUserId }),
    onSuccess: (_d, number) => {
      toast.success(`${number} assigned in Dialpad and added to rotation.`);
      invalidate();
      qc.invalidateQueries({ queryKey: ["dialpad-reserved-numbers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Assign failed."),
  });
  const returnToDialpad = useMutation({
    mutationFn: (number: string) => invokeDialpad({ action: "unassign_dialpad_number", number }),
    onSuccess: (_d, number) => {
      toast.success(`${number} returned to the Dialpad reserved pool.`);
      invalidate();
      qc.invalidateQueries({ queryKey: ["dialpad-reserved-numbers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unassign failed."),
  });
  const selectedRepLabel = profiles.find((p) => p.user_id === selectedUserId)?.display_name
    ?? profiles.find((p) => p.user_id === selectedUserId)?.email
    ?? "this rep";
  const repDialpad = reservedQuery.data?.users.find((u) => u.user_id === selectedUserId);

  const move = (index: number, delta: number) => {
    const target = pool[index + delta];
    if (!target) return;
    swapPositions.mutate({ a: pool[index], b: target });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1 space-y-1">
          <Label className="text-xs">Rep</Label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a rep to manage rotation…" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.display_name || p.email || p.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedUserId && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-mono">
            <Radio className="h-3.5 w-3.5 text-primary" />
            {activePool.length > 0 ? (
              <>
                <span className="text-foreground">{activePool[activeIndex]?.phone_number}</span>
                <span className="text-muted-foreground">
                  · #{activeIndex + 1} of {activePool.length} · dial {rotationCount}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">No pool — dialer uses fallback caller ID</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => resetCounter.mutate()}
              disabled={resetCounter.isPending}
              title="Reset rotation counter to 0"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          </div>
        )}
      </div>

      {selectedUserId && (
        <>
          <div className="rounded-lg border border-border bg-card">
            {poolLoading ? (
              <div className="p-6 text-center text-muted-foreground">Loading pool…</div>
            ) : pool.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No numbers yet — add one below. Rotation stays inert until at least one is added.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Phone (E.164)</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Owned</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-[160px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pool.map((row, idx) => {
                    const isCurrent =
                      row.is_active && row.owned_attested && activePool[activeIndex]?.id === row.id;
                    return (
                      <TableRow key={row.id} className={isCurrent ? "bg-primary/5" : ""}>
                        <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {row.phone_number}
                          {isCurrent && <span className="ml-2 text-[10px] uppercase text-primary">active</span>}
                          {!row.owned_attested && (
                            <span className="ml-2 text-[10px] uppercase text-destructive">unattested</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.area_code ?? "—"}
                          {row.region ? <span className="ml-1 opacity-70">· {row.region}</span> : null}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.label || "—"}</TableCell>
                        <TableCell>
                          <Switch
                            checked={row.owned_attested}
                            onCheckedChange={(v) => toggleAttested.mutate({ id: row.id, owned_attested: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={row.is_active}
                            onCheckedChange={(v) => toggleActive.mutate({ id: row.id, is_active: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => move(idx, -1)}>
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" disabled={idx === pool.length - 1} onClick={() => move(idx, 1)}>
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            {row.label === "Dialpad" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Unassign in Dialpad and return it to the reserved pool"
                                disabled={returnToDialpad.isPending}
                                onClick={() => {
                                  if (window.confirm(`Return ${row.phone_number} to the Dialpad reserved pool? Callbacks to it will no longer reach ${selectedRepLabel}.`)) {
                                    returnToDialpad.mutate(row.phone_number);
                                  }
                                }}
                              >
                                <Undo2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => removeNumber.mutate(row.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Add caller ID number ({pool.length}/{MAX_POOL_SIZE}) — accepts E.164 (+61…) or AU 04/0X formats.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="+61 400 000 000"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="max-w-[220px] font-mono"
              />
              <Input
                placeholder="Label (optional)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="max-w-[200px]"
              />
              <Button
                onClick={() => addNumber.mutate()}
                disabled={addNumber.isPending || !newPhone.trim() || pool.length >= MAX_POOL_SIZE || !newAttested}
              >
                {addNumber.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add
              </Button>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={newAttested}
                onCheckedChange={(v) => setNewAttested(v === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-foreground">I confirm we own this number and it is answerable/returnable.</span>{" "}
                Required by AU telemarketing rules — only owned, answerable numbers may be used as caller ID. Never present a blank or withheld CLI.
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Dialpad numbers</p>
                <p className="text-xs text-muted-foreground">
                  Reserved numbers sit unassigned in Dialpad. Assigning one to {selectedRepLabel} keeps it on them so callbacks still ring, and the dialer rotates the caller ID across their numbers every {ROTATION_INTERVAL} dials.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncFromDialpad.isPending}
                  onClick={() => syncFromDialpad.mutate()}
                  title="Pull this rep's numbers from Dialpad into the rotation pool"
                >
                  {syncFromDialpad.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Sync from Dialpad
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reservedQuery.isFetching}
                  onClick={() => {
                    if (reservedOpen) reservedQuery.refetch();
                    else setReservedOpen(true);
                  }}
                >
                  {reservedQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  {reservedOpen ? "Reload reserved" : "Load reserved numbers"}
                </Button>
              </div>
            </div>

            {reservedQuery.isError && (
              <p className="mt-3 text-xs text-destructive">
                {reservedQuery.error instanceof Error ? reservedQuery.error.message : "Could not reach Dialpad."}
              </p>
            )}

            {reservedQuery.data && (
              <div className="mt-3 space-y-3">
                {repDialpad && (
                  <p className="text-xs text-muted-foreground">
                    Dialpad currently has {repDialpad.phone_numbers.length} number{repDialpad.phone_numbers.length === 1 ? "" : "s"} on {selectedRepLabel}:{" "}
                    <span className="font-mono text-foreground">{repDialpad.phone_numbers.join(", ") || "none"}</span>
                  </p>
                )}
                {reservedQuery.data.available.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reserved numbers in Dialpad right now.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reserved number</TableHead>
                        <TableHead>Area</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="w-[180px] text-right">Assign</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reservedQuery.data.available.map((n) => (
                        <TableRow key={n.number}>
                          <TableCell className="font-mono text-sm">{n.number}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{n.area_code ?? deriveAreaCode(n.number) ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{n.type ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={assignFromDialpad.isPending || activePool.length >= MAX_POOL_SIZE}
                              onClick={() => assignFromDialpad.mutate(n.number)}
                            >
                              Assign to {selectedRepLabel}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}