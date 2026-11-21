const TONES = [
  "bg-ink text-white",
  "bg-zinc-200 text-zinc-800",
  "bg-stone-300 text-stone-900",
  "bg-slate-300 text-slate-900",
];

/** The name people recognise: "go.example.com" becomes "EXAMPLE". */
function shortName(host: string): string {
  const parts = host.split(".");
  return (parts.length >= 2 ? parts[parts.length - 2] : parts[0]).slice(0, 12).toUpperCase();
}

function toneFor(host: string): string {
  let h = 0;
  for (const c of shortName(host)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

/** A domain as a small uppercase tag. */
export function DomainTag({ host }: { host: string }) {
  return (
    <span className={`tag ${toneFor(host)}`} title={host}>
      {shortName(host)}
    </span>
  );
}

/**
 * The domain's mark: its own brand icon when one has been fetched, otherwise a two-letter key in the
 * domain's colour. `id` and `hasIcon` come from the domain row.
 */
export function DomainKey({ host, id, hasIcon, size = 36 }: { host: string; id?: number; hasIcon?: boolean; size?: number }) {
  const box = { width: size, height: size };
  if (hasIcon && id) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/domains/${id}/icon`}
        alt=""
        title={host}
        width={size}
        height={size}
        style={box}
        className="shrink-0 rounded-lg bg-white object-contain p-1 ring-1 ring-line"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      title={host}
      style={{ ...box, fontSize: Math.round(size * 0.36) }}
      className={`grid shrink-0 place-items-center rounded-lg font-bold lowercase ${toneFor(host)}`}
    >
      {shortName(host).slice(0, 2)}
    </span>
  );
}
