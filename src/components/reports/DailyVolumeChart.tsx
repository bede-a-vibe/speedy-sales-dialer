interface DailyVolumeChartProps {
  data: Array<{ date: string; count: number }>;
}

export function DailyVolumeChart({ data }: DailyVolumeChartProps) {
  const maxVolume = Math.max(1, ...data.map((item) => item.count));

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No call activity in this range.</p>;
  }

  return (
    <>
      <div className="flex h-32 items-end gap-1">
        {data.map((item) => (
          <div key={item.date} className="group relative flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="min-h-[2px] w-full rounded-t bg-primary/80 transition-all hover:bg-primary"
              style={{ height: `${(item.count / maxVolume) * 100}%` }}
            />
            <div className="absolute left-1/2 -top-6 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-mono text-background group-hover:block">
              {item.date.slice(5)}: {item.count}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between">
        <span className="text-[10px] font-mono text-muted-foreground">{data[0]?.date.slice(5)}</span>
        <span className="text-[10px] font-mono text-muted-foreground">{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </>
  );
}
