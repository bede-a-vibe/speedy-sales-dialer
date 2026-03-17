import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  dx: number;
  dy: number;
  dr: number;
  opacity: number;
  shape: "circle" | "square" | "strip";
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--outcome-booked))",
  "hsl(var(--outcome-voicemail))",
  "hsl(var(--outcome-follow-up))",
  "hsl(220 65% 68%)",
  "hsl(152 55% 62%)",
];

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 40 + Math.random() * 20, // cluster near center horizontally
    y: 30 + Math.random() * 10,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 4 + Math.random() * 6,
    rotation: Math.random() * 360,
    dx: (Math.random() - 0.5) * 4,
    dy: -2 - Math.random() * 3,
    dr: (Math.random() - 0.5) * 15,
    opacity: 1,
    shape: (["circle", "square", "strip"] as const)[Math.floor(Math.random() * 3)],
  }));
}

interface ConfettiBurstProps {
  active: boolean;
  className?: string;
}

export function ConfettiBurst({ active, className }: ConfettiBurstProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const rafRef = useRef<number>();
  const frameRef = useRef(0);

  const animate = useCallback(() => {
    frameRef.current++;
    setParticles((prev) =>
      prev
        .map((p) => ({
          ...p,
          x: p.x + p.dx * 0.3,
          y: p.y + p.dy * 0.3 + frameRef.current * 0.04, // gravity
          dy: p.dy + 0.08,
          rotation: p.rotation + p.dr,
          opacity: Math.max(0, p.opacity - 0.012),
        }))
        .filter((p) => p.opacity > 0)
    );
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (active) {
      frameRef.current = 0;
      setParticles(createParticles(24));
      rafRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, animate]);

  if (particles.length === 0) return null;

  return (
    <div className={cn("absolute inset-0 pointer-events-none overflow-hidden z-10", className)}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.shape === "strip" ? p.size * 0.4 : p.size,
            height: p.shape === "strip" ? p.size * 1.8 : p.size,
            backgroundColor: p.color,
            borderRadius: p.shape === "circle" ? "50%" : p.shape === "strip" ? "1px" : "1px",
            transform: `rotate(${p.rotation}deg)`,
            opacity: p.opacity,
            transition: "none",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Hook that fires confetti once when `condition` transitions from false → true.
 * Returns [shouldShow, triggerKey] where triggerKey changes each time it fires.
 */
export function useConfettiTrigger(condition: boolean) {
  const prevRef = useRef(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (condition && !prevRef.current) {
      setActive(true);
      const timer = setTimeout(() => setActive(false), 2500);
      return () => clearTimeout(timer);
    }
    prevRef.current = condition;
  }, [condition]);

  return active;
}
