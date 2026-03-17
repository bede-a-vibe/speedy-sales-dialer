import { useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

const LEADCONNECTOR_BOOKING_SRC = "https://api.leadconnectorhq.com/widget/booking/2QI1qZlvFfWUIz7MVLf9";
const LEADCONNECTOR_EMBED_SCRIPT_SRC = "https://link.msgsndr.com/js/form_embed.js";
const TRUSTED_ORIGIN_FRAGMENTS = ["leadconnectorhq.com", "msgsndr.com"];
const DATE_KEY_HINTS = ["date", "start", "time", "slot", "appointment", "booking", "selected"];

interface InlineBookingEmbedProps {
  className?: string;
  onDetectedDate?: (date: Date) => void;
}

function normalizeToLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateCandidate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return normalizeToLocalDay(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const fromTimestamp = new Date(value);
    return Number.isNaN(fromTimestamp.getTime()) ? null : normalizeToLocalDay(fromTimestamp);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const localDateMatch = trimmed.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (localDateMatch) {
    const [, year, month, day] = localDateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return normalizeToLocalDay(parsed);
}

function coerceMessagePayload(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function extractDateFromPayload(value: unknown, depth = 0): Date | null {
  if (depth > 5 || value == null) return null;

  const directDate = parseDateCandidate(value);
  if (directDate) return directDate;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nestedDate = extractDateFromPayload(entry, depth + 1);
      if (nestedDate) return nestedDate;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  const entries = Object.entries(value as Record<string, unknown>);
  const prioritizedEntries = [
    ...entries.filter(([key]) => DATE_KEY_HINTS.some((hint) => key.toLowerCase().includes(hint))),
    ...entries.filter(([key]) => !DATE_KEY_HINTS.some((hint) => key.toLowerCase().includes(hint))),
  ];

  for (const [, entryValue] of prioritizedEntries) {
    const nestedDate = extractDateFromPayload(entryValue, depth + 1);
    if (nestedDate) return nestedDate;
  }

  return null;
}

export function InlineBookingEmbed({ className, onDetectedDate }: InlineBookingEmbedProps) {
  const lastDetectedKeyRef = useRef<string | null>(null);
  const iframeId = useMemo(
    () => `leadconnector-booking-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${LEADCONNECTOR_EMBED_SCRIPT_SRC}"]`,
    );

    if (existingScript) return;

    const script = document.createElement("script");
    script.src = LEADCONNECTOR_EMBED_SCRIPT_SRC;
    script.type = "text/javascript";
    script.async = true;
    script.setAttribute("data-leadconnector-embed", "true");
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!onDetectedDate || typeof window === "undefined") return;

    const handleMessage = (event: MessageEvent) => {
      if (!TRUSTED_ORIGIN_FRAGMENTS.some((fragment) => event.origin.includes(fragment))) {
        return;
      }

      const payload = coerceMessagePayload(event.data);
      const detectedDate = extractDateFromPayload(payload);
      if (!detectedDate) return;

      const nextKey = detectedDate.toISOString().slice(0, 10);
      if (lastDetectedKeyRef.current === nextKey) return;

      lastDetectedKeyRef.current = nextKey;
      onDetectedDate(detectedDate);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onDetectedDate]);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-background", className)}>
      <iframe
        id={iframeId}
        title="Appointment booking calendar"
        src={LEADCONNECTOR_BOOKING_SRC}
        className="w-full border-0"
        style={{ minHeight: "720px", overflow: "hidden" }}
        scrolling="no"
      />
    </div>
  );
}

export default InlineBookingEmbed;
