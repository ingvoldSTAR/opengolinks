import { DomainKey } from "./DomainTag";
import { labelClass } from "./styles";

type Domain = { id: number; host: string; has_icon: boolean; link_count: number };

/** Choose a domain with one click: a tile per domain, with its icon and link count. */
export function DomainPicker({ domains, selectedId }: { domains: Domain[]; selectedId?: number }) {
  const chosen = domains.some((d) => d.id === selectedId) ? selectedId : domains[0]?.id;
  return (
    <fieldset>
      <legend className={labelClass}>Domain</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-2.5">
        {domains.map((d) => (
          <label key={d.id} className="block cursor-pointer">
            <input type="radio" name="domain_id" value={d.id} defaultChecked={d.id === chosen} className="peer sr-only" />
            <span className="flex items-center gap-3 rounded-xl border border-line bg-ground/60 px-3 py-2.5 transition-colors hover:border-ink/30 peer-checked:border-accent peer-checked:bg-white peer-checked:ring-2 peer-checked:ring-accent/20 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              <DomainKey host={d.host} id={d.id} hasIcon={d.has_icon} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold leading-tight">{d.host}</span>
                <span className="block text-xs text-mute">{d.link_count} {d.link_count === 1 ? "link" : "links"}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
