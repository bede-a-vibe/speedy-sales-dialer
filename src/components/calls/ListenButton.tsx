import { useState } from "react";
import { ExternalLink, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the Dialpad recording share link on demand and plays it inline.
 * Shared by the winning-calls library and the manager's review dialog — one
 * path to audio, so a broken recording link fails the same way everywhere.
 */
export function ListenButton({ dialpadCallId, autoPlay = true, className }: { dialpadCallId: string; autoPlay?: boolean; className?: string }) {
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("dialpad", {
        body: { action: "get_call_recording", dialpad_call_id: dialpadCallId },
      });
      if (fnError) throw fnError;
      if (!data?.access_link) throw new Error(data?.error ?? "No recording available");
      setShareUrl(data.access_link as string);
      // Pull the audio through our backend and play it as a local file — Dialpad's
      // redirecting share link stalls in some browsers (stuck at 0:00).
      try {
        const { data: bytes, error: proxyErr } = await supabase.functions.invoke("dialpad", {
          body: { action: "proxy_recording_audio", access_link: data.access_link },
        });
        if (proxyErr || !bytes) throw proxyErr ?? new Error("empty");
        const blob = bytes instanceof Blob ? bytes : new Blob([bytes as ArrayBuffer]);
        setAudioUrl(URL.createObjectURL(new Blob([blob], { type: "audio/mpeg" })));
      } catch {
        setAudioUrl(data.access_link as string);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the recording.");
    } finally {
      setLoading(false);
    }
  };

  if (audioUrl) {
    return (
      <div className={className ?? "mb-3 flex flex-wrap items-center gap-2"}>
        <audio controls autoPlay={autoPlay} src={audioUrl} className="h-9 w-full max-w-md" />
        <a href={shareUrl ?? audioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
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
