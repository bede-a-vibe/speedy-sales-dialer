import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export type LoginLinkRequest =
  | { action: "reset_link"; user_id: string }
  | { action: "create_login"; email: string; display_name?: string; role?: "admin" | "coach" | "sales_rep" | null };

export interface LoginLinkResult {
  email: string;
  link: string;
  created: boolean;
}

/**
 * One-time login links from the admin-login-links function. The dialer sends
 * no emails, so the admin copies the link and sends it to the person, who sets
 * their own password on /reset-password.
 */
export function useLoginLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (req: LoginLinkRequest): Promise<LoginLinkResult> => {
      const { data, error } = await supabase.functions.invoke("admin-login-links", {
        body: { ...req, origin: window.location.origin },
      });
      // A non-2xx reply carries the reason in the body.
      if (error) {
        let message = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          const body = ctx ? await ctx.json() : null;
          if (body?.error) message = body.error;
        } catch {
          // keep the generic message
        }
        throw new Error(message);
      }
      const res = data as { email?: string; link?: string; error?: string };
      if (res?.error || !res?.link || !res.email) throw new Error(res?.error ?? "No link came back");
      return { email: res.email, link: res.link, created: req.action === "create_login" };
    },
    onSuccess: (r) => {
      if (r.created) queryClient.invalidateQueries({ queryKey: ["admin-users-with-roles"] });
    },
  });
}

/** Shows a made link with a copy button. */
export function LoginLinkDialog({ result, onClose }: { result: LoginLinkResult | null; onClose: () => void }) {
  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.link);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy: select the link and copy it");
    }
  };
  return (
    <Dialog open={!!result} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result?.created ? "Login created" : "Password reset link"}</DialogTitle>
          <DialogDescription>
            Send this link to {result?.email}. It opens a page where they set their own password. It works once and
            expires in about an hour; make a new one if it runs out. Anyone with the link can set the password, so send
            it only to them.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={result?.link ?? ""} aria-label="Login link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button type="button" size="sm" onClick={copy}>
            <Copy className="mr-1 h-3.5 w-3.5" /> Copy
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Add login": creates the login (no password) and returns its set-password link. */
export function AddLoginDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (r: LoginLinkResult) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "coach" | "sales_rep" | "none">("sales_rep");
  const make = useLoginLink();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    make.mutate(
      { action: "create_login", email, display_name: name || undefined, role: role === "none" ? null : role },
      {
        onSuccess: (r) => {
          onOpenChange(false);
          setEmail("");
          setName("");
          setRole("sales_rep");
          onCreated(r);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create the login"),
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add login</DialogTitle>
            <DialogDescription>Creates the login and gives you a link to send them. They set their own password from it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="add-login-email">Email</Label>
            <Input id="add-login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@odindigital.com.au" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-login-name">Name</Label>
            <Input id="add-login-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown in the dialer" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-login-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger id="add-login-role" aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sales_rep">Sales Rep</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="coach">Coach</SelectItem>
                <SelectItem value="none">No role yet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={make.isPending}>
              {make.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Create and get link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
