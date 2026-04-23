import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCallOpeners, useCreateCallOpener, useUpdateCallOpener, useDeleteCallOpener, type CallOpener } from "@/hooks/useCallOpeners";

export function CallOpenersManager() {
  const { data: openers = [] } = useCallOpeners(true);
  const createOpener = useCreateCallOpener();
  const updateOpener = useUpdateCallOpener();
  const deleteOpener = useDeleteCallOpener();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CallOpener | null>(null);
  const [name, setName] = useState("");
  const [script, setScript] = useState("");

  const reset = () => {
    setEditing(null);
    setName("");
    setScript("");
  };

  const openCreate = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (o: CallOpener) => {
    setEditing(o);
    setName(o.name);
    setScript(o.script);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      if (editing) {
        await updateOpener.mutateAsync({ id: editing.id, name: name.trim(), script });
        toast.success("Opener updated");
      } else {
        await createOpener.mutateAsync({ name: name.trim(), script });
        toast.success("Opener created");
      }
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save opener");
    }
  };

  const handleToggleActive = async (o: CallOpener) => {
    try {
      await updateOpener.mutateAsync({ id: o.id, is_active: !o.is_active });
    } catch (e) {
      toast.error("Failed to update opener");
    }
  };

  const handleDelete = async (o: CallOpener) => {
    if (!confirm(`Delete opener "${o.name}"? This cannot be undone.`)) return;
    try {
      await deleteOpener.mutateAsync(o.id);
      toast.success("Opener deleted");
    } catch (e) {
      toast.error("Failed to delete opener");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Call Openers</CardTitle>
          <CardDescription>Manage script variants reps can attribute calls to.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> New Opener
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit opener" : "New opener"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pain-Led" />
              </div>
              <div className="space-y-1.5">
                <Label>Script</Label>
                <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={6} placeholder="Opening line / approach..." />
              </div>
              <Button onClick={handleSave} disabled={createOpener.isPending || updateOpener.isPending} className="w-full">
                {editing ? "Save changes" : "Create opener"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {openers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No openers yet. Create one to start tracking which scripts work best.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Script preview</TableHead>
                <TableHead className="w-[100px]">Active</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openers.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">{o.script || "—"}</TableCell>
                  <TableCell>
                    <Switch checked={o.is_active} onCheckedChange={() => handleToggleActive(o)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(o)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(o)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
