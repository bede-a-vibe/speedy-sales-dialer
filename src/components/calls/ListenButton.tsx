import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { noteListen, reportClientError } from "@/lib/errorReporter";

/** How long a streamed recording gets to show it is playable before the full download takes over. */
const STREAM_GRACE_MS = 8000;

type Source = { url: string; kind: "stream" | "file"; resumeAt: number; play: boolean };

/**
 * Plays a Dialpad recording inline. It streams, so a long call starts as fast
 * as a short one. If the stream stalls or fails, the whole recording is pulled
 * through our backend instead and playback carries on from the same second.
 * Every Listen button in the app is this one.
 */
export function ListenButton({ dialpadCallId, autoPlay = true, className }: { dialpadCallId: string; autoPlay?: boolean; className?: string }) {
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fellBack = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Free the downloaded recording when the player goes away.
  useEffect(() => {
    const url = source?.url;
    return () => { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [source?.url]);

  /** The whole recording, through our backend, as a local file. */
  const playFile = async (accessLink: string, resumeAt: number, play: boolean) => {
    try {
      const { data: bytes, error: proxyErr } = await supabase.functions.invoke("dialpad", {
        body: { action: "proxy_recording_audio", access_link: accessLink },
      });
      if (proxyErr || !bytes) throw proxyErr ?? new Error("empty");
      if (!alive.current) return;
      const blob = bytes instanceof Blob ? bytes : new Blob([bytes as ArrayBuffer]);
      setSource({ url: URL.createObjectURL(new Blob([blob], { type: "audio/mpeg" })), kind: "file", resumeAt, play });
    } catch (proxyFailure) {
      reportClientError("recording_proxy_failed", String((proxyFailure as Error)?.message ?? proxyFailure), { dialpadCallId });
      if (alive.current) setSource({ url: accessLink, kind: "file", resumeAt, play });
    }
  };

  const fallBack = async (why: string) => {
    if (fellBack.current || !shareUrl) return;
    fellBack.current = true;
    const el = audioRef.current;
    reportClientError("recording_stream_failed", why, { dialpadCallId });
    const at = el?.currentTime ?? 0;
    setLoading(true);
    // A player that died mid-call keeps going; one that never started follows autoPlay.
    await playFile(shareUrl, at, at > 0 || autoPlay || el?.paused === false);
    if (alive.current) setLoading(false);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    fellBack.current = false;
    noteListen(`load ${dialpadCallId}`);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("dialpad", {
        body: { action: "get_call_recording", dialpad_call_id: dialpadCallId },
      });
      if (fnError) throw fnError;
      if (!data?.access_link) throw new Error(data?.error ?? "No recording available");
      if (!alive.current) return;
      setShareUrl(data.access_link as string);
      if (data.stream_url) setSource({ url: data.stream_url as string, kind: "stream", resumeAt: 0, play: autoPlay });
      else await playFile(data.access_link as string, 0, autoPlay);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't load the recording.";
      reportClientError("recording_load_failed", msg, { dialpadCallId });
      if (alive.current) setError(msg);
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  // A stream that shows nothing playable in time is stuck, not slow.
  const streaming = source?.kind === "stream" ? source.url : null;
  useEffect(() => {
    if (!streaming) return;
    const t = window.setTimeout(() => {
      if ((audioRef.current?.readyState ?? 0) < 1) void fallBack("stalled");
    }, STREAM_GRACE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  if (source) {
    return (
      <div className={className ?? "mb-3 flex flex-wrap items-center gap-2"}>
        <audio
          key={source.url}
          ref={audioRef}
          controls
          autoPlay={source.play}
          preload="metadata"
          src={source.url}
          className="h-9 w-full min-w-[260px] max-w-md"
          onLoadedMetadata={(e) => { if (source.resumeAt > 0) e.currentTarget.currentTime = source.resumeAt; }}
          // One recording at a time: starting this one pauses any other player on the page.
          onPlay={(e) => {
            noteListen(`play ${dialpadCallId}`);
            document.querySelectorAll("audio").forEach((a) => {
              if (a !== e.currentTarget && !a.paused) a.pause();
            });
          }}
          onError={(e) => {
            const why = `audio error ${e.currentTarget.error?.code ?? "?"}`;
            if (source.kind === "stream") void fallBack(why);
            else reportClientError("recording_playback_failed", why, { dialpadCallId, blob: source.url.startsWith("blob:") });
          }}
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading the recording" />}
        <a href={shareUrl ?? source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Open recording <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className={className ?? "mb-3"}>
      <Button size="sm" variant="outline" onClick={load} disabled={loading}>
        {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
        Listen to the call
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
