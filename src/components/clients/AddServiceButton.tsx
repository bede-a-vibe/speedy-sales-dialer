import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DealDialog, type DealDialogState } from "./DealDialog";

type ButtonVariant = "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

interface AddServiceButtonProps {
  contactId: string;
  contactBusinessName?: string | null;
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  className?: string;
  onSaved?: () => void;
}

export function AddServiceButton({
  contactId,
  contactBusinessName,
  variant = "outline",
  size = "sm",
  label = "Add service",
  className,
  onSaved,
}: AddServiceButtonProps) {
  const [dialog, setDialog] = useState<DealDialogState>({
    open: false,
    mode: "create",
    contactId,
    contactBusinessName: contactBusinessName ?? undefined,
  });

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn(className)}
        onClick={() =>
          setDialog({
            open: true,
            mode: "create",
            contactId,
            contactBusinessName: contactBusinessName ?? undefined,
          })
        }
      >
        <Plus className={cn("h-3.5 w-3.5", label ? "mr-1.5" : "")} />
        {label}
      </Button>
      {dialog.open && (
        <DealDialog
          state={dialog}
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          onSaved={() => onSaved?.()}
        />
      )}
    </>
  );
}