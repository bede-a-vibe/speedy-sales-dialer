import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CollapsiblePanelProps {
  title: string;
  /** Short hint to the right of the title when collapsed (e.g. "Live", "3 ready"). */
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline" | "destructive";
  /** Tiny icon to the left of the title. */
  icon?: ReactNode;
  /** Optional one-line subtitle shown when collapsed and expanded. */
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * A consistent, lightweight collapsible wrapper for low-priority dialer panels.
 * Closed by default — keeps the active-call view tidy while leaving content one tap away.
 */
export function CollapsiblePanel({
  title,
  badge,
  badgeVariant = "secondary",
  icon,
  subtitle,
  defaultOpen = false,
  children,
  className,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("rounded-lg border border-border bg-card", className)}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</p>
            {subtitle ? <p className="truncate text-sm text-foreground">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge ? (
            <Badge variant={badgeVariant} className="font-mono text-[10px] uppercase tracking-widest">
              {badge}
            </Badge>
          ) : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-4 py-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
