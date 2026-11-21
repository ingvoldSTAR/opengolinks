/** Seven needle-thin bars, one per day, oldest first. */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <span
      role="img"
      aria-label={`Clicks in the last 7 days: ${values.join(", ")}`}
      className="inline-flex h-7 items-end gap-[3px]"
    >
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${v === 0 ? "bg-ink/15" : i === values.length - 1 ? "bg-accent" : total > 0 ? "bg-ink/70" : "bg-ink/15"}`}
          style={{ height: v === 0 ? "3px" : `${Math.max(18, (v / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}
