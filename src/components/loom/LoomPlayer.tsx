import { toEmbedUrl } from "@/hooks/useLms";

export function LoomPlayer({ url, title }: { url: string; title: string }) {
  const embed = toEmbedUrl(url);
  if (embed?.kind !== "iframe") return <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Open the Loom</a>;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
      <iframe src={embed.src} title={title} className="h-full w-full" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
    </div>
  );
}
