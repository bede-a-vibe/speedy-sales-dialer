import { useEffect, useRef, useState } from "react";

export function useAnimatedCounter(target: number, duration = 800, enabled = true) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }

    const start = prevTarget.current;
    const diff = target - start;
    if (diff === 0) {
      // Target matches our last known target, but `value` may be mid-animation
      // from a previous run that was cancelled (e.g. data refetched briefly to
      // 0 then back). Snap to target so the displayed number never lies.
      setValue(target);
      return;
    }

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + diff * eased);
      setValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevTarget.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Mark this target as "seen" so a subsequent effect with the same target
      // won't think the value is already settled when the animation was
      // actually cancelled mid-flight.
      prevTarget.current = target;
    };
  }, [target, duration, enabled]);

  return value;
}
