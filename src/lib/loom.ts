/** Strip a pasted Loom link (?sid=, embed form, trailing text) to its plain share link, or null if it isn't one. */
export function normaliseLoomUrl(input: string): string | null {
  const m = input.trim().match(/^(?:https?:\/\/)?(?:www\.)?loom\.com\/(?:share|embed)\/([A-Za-z0-9-]+)/i);
  if (!m) return null;
  // Loom also makes links with the title in front: /share/My-title-<32 hex>.
  const id = m[1].match(/[a-f0-9]{32}$/i)?.[0] ?? m[1];
  return /^[A-Za-z0-9]+$/.test(id) ? `https://www.loom.com/share/${id}` : null;
}

export interface LoomMeta { title: string | null; duration: number | null }

/** Title and length from Loom's public oEmbed. Never throws: a miss just means typing the title. */
export async function fetchLoomMeta(shareUrl: string): Promise<LoomMeta> {
  try {
    const res = await fetch(`https://www.loom.com/v1/oembed?url=${encodeURIComponent(shareUrl)}`);
    if (!res.ok) return { title: null, duration: null };
    const d = (await res.json()) as { title?: string; duration?: number };
    return { title: d.title ?? null, duration: typeof d.duration === "number" ? Math.round(d.duration) : null };
  } catch {
    return { title: null, duration: null };
  }
}

/** 1686 -> "28 min". */
export const fmtLoomLength = (s: number | null | undefined) => (s ? `${Math.max(1, Math.round(s / 60))} min` : null);

/** 109 -> "1m 49s". */
export const fmtTalk = (s: number | null) => (s ? `${Math.floor(s / 60)}m ${s % 60}s` : null);

/** "23 Nov", Melbourne time. */
export const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Melbourne" }) : null;
