/**
 * The one full-page loading state. Matches the boot splash in index.html so the
 * hand-off from HTML to React (and between lazy routes) is seamless.
 */
export function FullPageLoading({ label = "Loading Speedy Dialer" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-3.5 bg-background font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"
    >
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary motion-reduce:[animation-duration:2.4s]" />
      {label}
    </div>
  );
}
