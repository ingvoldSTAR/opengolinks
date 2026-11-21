"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DomainKey } from "./DomainTag";
import { SearchIcon } from "./Icons";

type Domain = { id: number; host: string; has_icon: boolean; link_count: number };

function href(q: string, d?: number) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (d) p.set("d", String(d));
  const s = p.toString();
  return s ? `/admin?${s}` : "/admin";
}

/** Live search and a domain filter, no Filter button to press. */
export function LinkFilters({ domains, q, d, total }: { domains: Domain[]; q: string; d?: number; total: number }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => router.replace(href(value.trim(), d), { scroll: false }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="group" aria-label="Filter by domain">
        <Link
          href={href(value.trim())}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${!d ? "bg-ink text-white" : "bg-white text-ink/80 ring-1 ring-line hover:ring-ink/30"}`}
        >
          All <span className="ml-1 opacity-70">{total}</span>
        </Link>
        {domains.map((dom) => (
          <Link
            key={dom.id}
            href={href(value.trim(), dom.id)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg py-1.5 pl-1.5 pr-3 text-sm font-semibold transition-colors ${d === dom.id ? "bg-ink text-white" : "bg-white text-ink/80 ring-1 ring-line hover:ring-ink/30"}`}
          >
            <DomainKey host={dom.host} id={dom.id} hasIcon={dom.has_icon} size={26} />
            {dom.host}
            <span className="opacity-70">{dom.link_count}</span>
          </Link>
        ))}
      </div>
      <div className="relative lg:w-80">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search slug, title or destination"
          aria-label="Search links"
          className="w-full rounded-lg border border-ink/20 bg-white py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-mute focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </div>
    </div>
  );
}
