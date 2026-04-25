import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, GraduationCap, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CoachStep {
  /** CSS selector matched against `[data-coach-step="..."]`. */
  target: string;
  title: string;
  body: string;
  /** Preferred placement; falls back to bottom if no room. */
  placement?: "top" | "bottom" | "left" | "right";
}

interface CoachTourProps {
  steps: CoachStep[];
  open: boolean;
  onClose: () => void;
  storageKey?: string;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const TOOLTIP_WIDTH = 340;
const TOOLTIP_GAP = 14;

function computeTooltipPos(
  rect: SpotlightRect,
  placement: CoachStep["placement"],
  vw: number,
  vh: number,
  estHeight: number,
) {
  const placements: Array<CoachStep["placement"]> = placement
    ? [placement, "bottom", "top", "right", "left"]
    : ["bottom", "top", "right", "left"];

  for (const p of placements) {
    let top = 0;
    let left = 0;
    if (p === "bottom") {
      top = rect.top + rect.height + TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    } else if (p === "top") {
      top = rect.top - estHeight - TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    } else if (p === "right") {
      top = rect.top + rect.height / 2 - estHeight / 2;
      left = rect.left + rect.width + TOOLTIP_GAP;
    } else {
      top = rect.top + rect.height / 2 - estHeight / 2;
      left = rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
    }
    const fits = top >= 8 && top + estHeight <= vh - 8 && left >= 8 && left + TOOLTIP_WIDTH <= vw - 8;
    if (fits) return { top, left, placement: p };
  }
  // Last resort — pin to bottom-center of viewport
  return {
    top: Math.max(8, vh - estHeight - 16),
    left: Math.max(8, vw / 2 - TOOLTIP_WIDTH / 2),
    placement: "bottom" as const,
  };
}

export function CoachTour({ steps, open, onClose, storageKey }: CoachTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [tip, setTip] = useState<{ top: number; left: number; placement: CoachStep["placement"] } | null>(null);
  const [missing, setMissing] = useState(false);

  const step = steps[stepIndex];

  // Reset to first step whenever the tour is opened.
  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  // Recompute spotlight rect whenever the step changes / window resizes.
  useLayoutEffect(() => {
    if (!open || !step) {
      setRect(null);
      setTip(null);
      return;
    }

    let raf = 0;
    let attempts = 0;

    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-coach-step="${step.target}"]`);
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (!el) {
        attempts += 1;
        if (attempts < 30) {
          raf = window.requestAnimationFrame(update);
        } else {
          setMissing(true);
          // Center tooltip if we can't find target (e.g. session not started yet)
          setRect(null);
          setTip({
            top: vh / 2 - 100,
            left: vw / 2 - TOOLTIP_WIDTH / 2,
            placement: "bottom",
          });
        }
        return;
      }

      setMissing(false);
      // Scroll target into view first.
      const r = el.getBoundingClientRect();
      const offscreen = r.top < 0 || r.bottom > vh;
      if (offscreen) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Recompute after scroll settles
        raf = window.requestAnimationFrame(update);
        return;
      }

      const next: SpotlightRect = {
        top: r.top - PADDING,
        left: r.left - PADDING,
        width: r.width + PADDING * 2,
        height: r.height + PADDING * 2,
      };
      setRect(next);
      const estHeight = 220;
      setTip(computeTooltipPos(next, step.placement, vw, vh, estHeight));
    };

    update();
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, step]);

  // Persist completion so we don't auto-replay.
  useEffect(() => {
    if (!open || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, "started");
    } catch {
      /* ignore */
    }
  }, [open, storageKey]);

  const finish = () => {
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, "completed");
      } catch {
        /* ignore */
      }
    }
    onClose();
  };

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setStepIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, steps.length]);

  const overlay = useMemo(() => {
    if (!rect) {
      // Solid dim layer when no spotlight target
      return (
        <div
          className="fixed inset-0 bg-black/60 transition-opacity"
          aria-hidden
        />
      );
    }
    // Four rectangles around the spotlight = cutout effect that still
    // blocks pointer events outside the highlighted element.
    const top = rect.top;
    const left = rect.left;
    const right = left + rect.width;
    const bottom = top + rect.height;
    return (
      <>
        <div className="fixed inset-x-0 top-0 bg-black/60" style={{ height: Math.max(0, top) }} aria-hidden />
        <div className="fixed left-0 bg-black/60" style={{ top, height: rect.height, width: Math.max(0, left) }} aria-hidden />
        <div className="fixed right-0 bg-black/60" style={{ top, height: rect.height, left: right, width: `calc(100vw - ${right}px)` }} aria-hidden />
        <div className="fixed inset-x-0 bottom-0 bg-black/60" style={{ top: bottom, height: `calc(100vh - ${bottom}px)` }} aria-hidden />
        {/* Highlight ring */}
        <div
          className="fixed pointer-events-none rounded-lg ring-2 ring-amber-400 shadow-[0_0_0_4px_hsla(45,95%,55%,0.25)] animate-pulse"
          style={{ top, left, width: rect.width, height: rect.height }}
          aria-hidden
        />
      </>
    );
  }, [rect]);

  if (!open || !step || !tip) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const node = (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Coach tour">
      {overlay}
      <div
        className="fixed z-[101] w-[340px] rounded-xl border border-amber-500/40 bg-card text-card-foreground shadow-2xl"
        style={{ top: tip.top, left: tip.left }}
      >
        <div className="flex items-center justify-between border-b border-border bg-amber-500/10 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-amber-700 dark:text-amber-300">
            <GraduationCap className="h-3.5 w-3.5" />
            Coach Tour · Step {stepIndex + 1} of {steps.length}
          </div>
          <button
            type="button"
            onClick={finish}
            className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2 px-4 py-3">
          <h3 className="text-sm font-semibold">{step.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
          {missing && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
              Tip: this control appears once a session is active or a contact is loaded. Click <em>Next</em> to keep going.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={isFirst}
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back
          </Button>
          <button
            type="button"
            onClick={finish}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Skip tour
          </button>
          {isLast ? (
            <Button size="sm" onClick={finish}>Finish</Button>
          ) : (
            <Button size="sm" onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}>
              Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

export default CoachTour;