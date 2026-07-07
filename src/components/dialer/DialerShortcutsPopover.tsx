import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["Enter"], label: "Save outcome & load next lead" },
  { keys: ["S"], label: "Skip current lead" },
  { keys: ["P"], label: "Pause / resume session" },
  { keys: ["1", "–", "6"], label: "Select outcome (No Answer → Booked)" },
  { keys: ["?"], label: "Show this shortcut list" },
  { keys: ["⌘", "K"], label: "Open command palette" },
];

export function DialerShortcutsPopover() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never hijack while typing
      const el = document.activeElement as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
      }
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          aria-label="Show keyboard shortcuts"
        >
          <Keyboard className="h-3.5 w-3.5" />
          Shortcuts
          <kbd className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ?
          </kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Keyboard shortcuts
        </p>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-3 text-xs text-foreground"
            >
              <span>{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Shortcuts pause automatically while you're typing in notes or filters.
        </p>
      </PopoverContent>
    </Popover>
  );
}