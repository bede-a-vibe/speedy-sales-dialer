import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAllDialpadSettings, useUpsertDialpadSettings, useDeleteDialpadSettings } from "@/hooks/useDialpadSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Phone, Loader2, Save, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

export default function DialpadSettingsPage() {
  const { data: settings = [], isLoading } = useAllDialpadSettings();
  const upsert = useUpsertDialpadSettings();
  const deleteMutation = useDeleteDialpadSettings();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [dialpadUserId, setDialpadUserId] = useState("");
  const [dialpadPhone, setDialpadPhone] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Fetch all profiles for the user dropdown (including ghl_user_id)
  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email, ghl_user_id")
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const queryClient = useQueryClient();
  const [ghlEdits, setGhlEdits] = useState<Record<string, string>>({});

  const saveGhlUserId = useMutation({
    mutationFn: async ({ userId, ghlUserId }: { userId: string; ghlUserId: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ ghl_user_id: ghlUserId.trim() || null })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["my-ghl-user-id"] });
      toast.success("GHL User ID saved.");
    },
    onError: () => toast.error("Failed to save GHL User ID."),
  });

  const assignedUserIds = new Set(settings.map((s) => s.user_id));

  const openNew = () => {
    setEditingId(null);
    setSelectedUserId("");
    setDialpadUserId("");
    setDialpadPhone("");
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (s: typeof settings[0]) => {
    setEditingId(s.id);
    setSelectedUserId(s.user_id);
    setDialpadUserId(s.dialpad_user_id);
    setDialpadPhone(s.dialpad_phone_number || "");
    setIsActive(s.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedUserId || !dialpadUserId.trim()) {
      toast.error("User and Dialpad User ID are required.");
      return;
    }
    try {
      await upsert.mutateAsync({
        user_id: selectedUserId,
        dialpad_user_id: dialpadUserId.trim(),
        dialpad_phone_number: dialpadPhone.trim() || undefined,
        is_active: isActive,
      });
      toast.success(editingId ? "Updated Dialpad assignment." : "Dialpad number assigned.");
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Assignment removed.");
    } catch {
      toast.error("Failed to delete.");
    }
  };

  return (
    <AppLayout title="Dialpad Settings">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">User Dialpad Assignments</h2>
            <p className="text-sm text-muted-foreground">Assign Dialpad user IDs and phone numbers to team members.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Assign Number
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit" : "Assign"} Dialpad Number</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>User</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={!!editingId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles
                        .filter((p) => editingId ? p.user_id === selectedUserId : !assignedUserIds.has(p.user_id))
                        .map((p) => (
                          <SelectItem key={p.user_id} value={p.user_id}>
                            {p.display_name || p.email || p.user_id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Dialpad User ID</Label>
                  <Input
                    value={dialpadUserId}
                    onChange={(e) => setDialpadUserId(e.target.value)}
                    placeholder="e.g. 1234567890"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number (display)</Label>
                  <Input
                    value={dialpadPhone}
                    onChange={(e) => setDialpadPhone(e.target.value)}
                    placeholder="e.g. +1 (555) 123-4567"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <Label>Active</Label>
                </div>
                <Button onClick={handleSave} disabled={upsert.isPending} className="w-full">
                  {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? "Update" : "Assign"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : settings.length === 0 ? (
            <div className="p-8 text-center">
              <Phone className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No Dialpad numbers assigned yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Dialpad User ID</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{s.display_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{s.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{s.dialpad_user_id}</TableCell>
                    <TableCell className="font-mono text-sm">{s.dialpad_phone_number || "—"}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
