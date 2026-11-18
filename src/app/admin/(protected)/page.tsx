import Link from "next/link";
import { ActionForm, SubmitButton, inputClass, labelClass } from "@/components/forms";
import { CopyButton } from "@/components/CopyButton";
import { UtmFields } from "@/components/UtmFields";
import { listDomains, listLinks } from "@/lib/links";
import { shortUrl } from "@/lib/url";
import { createLinkAction } from "../actions";

export default async function LinksPage({ searchParams }: { searchParams: Promise<{ q?: string; d?: string }> }) {
  const { q, d } = await searchParams;
  const domainFilter = Number(d) > 0 ? Number(d) : undefined;
  const [domains, links] = await Promise.all([listDomains(), listLinks(q, domainFilter)]);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-licorice/10 bg-white p-5">
        <h2 className="text-sm font-semibold">New link</h2>
        {domains.length === 0 ? (
          <p className="mt-3 text-sm">
            Add a domain first on the <Link href="/admin/domains" className="text-cobalt underline">Domains</Link> page.
          </p>
        ) : (
          <ActionForm action={createLinkAction} className="mt-4">
            <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
              <div>
                <label htmlFor="domain_id" className={labelClass}>Domain and slug</label>
                <div className="flex gap-2">
                  <select id="domain_id" name="domain_id" className={`${inputClass} max-w-[55%]`}>
                    {domains.map((dom) => (
                      <option key={dom.id} value={dom.id}>{dom.host}</option>
                    ))}
                  </select>
                  <input name="slug" placeholder="auto" aria-label="Slug" className={inputClass} />
                </div>
              </div>
              <div>
                <label htmlFor="destination" className={labelClass}>Destination</label>
                <input id="destination" name="destination" required placeholder="https://" className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="title" className={labelClass}>Title (optional)</label>
                <input id="title" name="title" className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <UtmFields />
              </div>
            </div>
            <div className="mt-4"><SubmitButton>Create link</SubmitButton></div>
          </ActionForm>
        )}
      </section>

      <section>
        <form className="mb-4 flex gap-2" method="get">
          <input name="q" defaultValue={q} placeholder="Search slug, title or destination" className={inputClass} />
          <select name="d" defaultValue={d ?? ""} className={`${inputClass} max-w-[14rem]`} aria-label="Filter by domain">
            <option value="">All domains</option>
            {domains.map((dom) => (
              <option key={dom.id} value={dom.id}>{dom.host}</option>
            ))}
          </select>
          <button className="rounded-md border border-licorice/20 bg-white px-4 text-sm font-medium hover:border-licorice/50">Filter</button>
        </form>

        <div className="overflow-hidden rounded-lg border border-licorice/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-licorice/10 text-xs uppercase tracking-wide text-licorice/60">
              <tr>
                <th className="px-4 py-3 font-medium">Short link</th>
                <th className="px-4 py-3 font-medium">Destination</th>
                <th className="px-4 py-3 text-right font-medium">7 days</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} className="border-b border-licorice/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/links/${l.id}`} className="font-medium text-cobalt hover:underline">
                      {l.host}/{l.slug}
                    </Link>
                    {l.title && <div className="text-xs text-licorice/60">{l.title}</div>}
                    {l.utm_campaign && (
                      <Link
                        href={`/admin/campaigns?c=${encodeURIComponent(l.utm_campaign)}`}
                        className="mt-1 inline-block rounded-full bg-cobalt/10 px-2 py-0.5 text-xs font-medium text-cobalt hover:bg-cobalt/20"
                      >
                        {l.utm_campaign}
                      </Link>
                    )}
                  </td>
                  <td className="max-w-[22rem] truncate px-4 py-3 text-licorice/80" title={l.destination_url}>
                    {l.destination_url}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.clicks_7d}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.clicks_total}</td>
                  <td className="px-4 py-3 text-right"><CopyButton value={shortUrl(l.host, l.slug)} /></td>
                </tr>
              ))}
              {links.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-licorice/60">No links yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
