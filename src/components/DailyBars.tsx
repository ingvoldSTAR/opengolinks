import type { DayCount } from "@/lib/links";

function label(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function DailyBars({ data }: { data: DayCount[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((sum, d) => sum + d.n, 0);
  const mid = data[Math.floor(data.length / 2)];

  return (
    <div>
      <div
        role="img"
        aria-label={`Clicks per day for the last ${data.length} days, ${total} in total`}
        className="flex h-32 items-end gap-[3px] border-b border-line"
      >
        {data.map((d, i) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-t-[3px] ${d.n > 0 ? (i >= data.length - 7 ? "bg-accent group-hover:bg-ink" : "bg-accent/35 group-hover:bg-ink") : "bg-ink/10"}`}
              style={{ height: d.n > 0 ? `${Math.max(4, (d.n / max) * 100)}%` : "2px" }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-white group-hover:block">
              {label(d.day)}: {d.n} {d.n === 1 ? "click" : "clicks"}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-mute">
        <span>{label(data[0].day)}</span>
        <span>{label(mid.day)}</span>
        <span>{label(data[data.length - 1].day)}</span>
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-mute">View as table</summary>
        <table className="mt-2 w-full max-w-xs text-left">
          <thead>
            <tr className="text-mute">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 font-medium">Clicks</th>
            </tr>
          </thead>
          <tbody>
            {data.filter((d) => d.n > 0).map((d) => (
              <tr key={d.day}>
                <td className="py-0.5">{label(d.day)}</td>
                <td className="py-0.5">{d.n}</td>
              </tr>
            ))}
            {total === 0 && (
              <tr><td colSpan={2} className="py-1 text-mute">No clicks yet.</td></tr>
            )}
          </tbody>
        </table>
      </details>
    </div>
  );
}
