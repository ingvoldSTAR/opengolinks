import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { inputClass, labelClass } from "@/components/styles";
import { CopyButton } from "@/components/CopyButton";
import { DomainKey } from "@/components/DomainTag";
import { DomainPicker } from "@/components/DomainPicker";
import { LinkFilters } from "@/components/LinkFilters";
import { Sparkline } from "@/components/Sparkline";
import { UtmFields } from "@/components/UtmFields";
import { backfillIcons } from "@/lib/favicon";
import { listDomains, listLinks, weeklyTrends } from "@/lib/links";
import { shortUrl } from "@/lib/url";
import { createLinkAction } from "../actions";

export default async function LinksPage({ searchParams }: { searchParams: Promise<{ q?: string; d?: string }> }) {
  const { q, d } = await searchParams;
  const domainFilter = Number(d) > 0 ? Number(d) : undefined;
  const [domains, links] = await Promise.all([listDomains(), listLinks(q, domainFilter)]);
  backfillIcons(domains);
  const trends = await weeklyTrends(links.map((l) => l.id));
  const totalLinks = domains.reduce((sum, dom) => sum + dom.link_count, 0);
  const filtered = Boolean(q?.trim()) || domainFilter !== undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Links</h1>
        <p className="mt-1 text-sm text-mute">Short links across your domains, with clicks and QR scans counted.</p>
      </div>

      <section className="card p-5 sm:p-6" aria-labelledby="new-link">
        <h2 id="new-link" className="text-lg font-extrabold">New link</h2>
        {domains.length === 0 ? (
          <p className="mt-3 text-sm text-mute">
            Add a domain first on the <Link href="/admin/domains" className="font-bold text-accent-deep underline underline-offset-4">Domains</Link> page.
          </p>
        ) : (
          <ActionForm action={createLinkAction} className="mt-5">
            <DomainPicker domains={domains} selectedId={domainFilter} />
            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,14rem)]">
              <div>
                <label htmlFor="slug" className={labelClass}>Slug</label>
                <input id="slug" name="slug" placeholder="auto" autoComplete="off" className={inputClass} />
              </div>
              <div>
                <label htmlFor="destination" className={labelClass}>Destination</label>
                <input id="destination" name="destination" required placeholder="https://" autoComplete="off" className={inputClass} />
              </div>
              <div>
                <label htmlFor="title" className={labelClass}>Title <span className="font-normal normal-case tracking-normal">(optional)</span></label>
                <input id="title" name="title" autoComplete="off" className={inputClass} />
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1"><UtmFields /></div>
              <div className="shrink-0"><SubmitButton>Create link</SubmitButton></div>
            </div>
          </ActionForm>
        )}
      </section>

      <section aria-label="All links">
        <LinkFilters domains={domains} q={q ?? ""} d={domainFilter} total={totalLinks} />

        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs font-bold uppercase tracking-wider text-mute">
              <tr>
                <th className="px-5 py-3.5">Short link</th>
                <th className="hidden px-5 py-3.5 md:table-cell">Destination</th>
                <th className="hidden whitespace-nowrap px-5 py-3.5 text-right sm:table-cell">Last 7 days</th>
                <th className="hidden whitespace-nowrap px-5 py-3.5 text-right sm:table-cell">Total</th>
                <th className="px-5 py-3.5"><span className="sr-only">Copy</span></th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const week = trends.get(l.id) ?? [];
                return (
                  <tr key={l.id} className="group border-b border-line last:border-0 transition-colors hover:bg-ground/70">
                    <td className="w-full max-w-0 px-4 py-3.5 sm:w-auto sm:max-w-none sm:px-5">
                      <div className="flex items-center gap-3">
                        <DomainKey host={l.host} id={l.domain_id} hasIcon={l.has_icon} />
                        <div className="min-w-0">
                          <Link href={`/admin/links/${l.id}`} className="block truncate text-[15px] leading-tight hover:text-accent-deep">
                            <span className="text-mute">{l.host}/</span>
                            <span className="font-extrabold">{l.slug}</span>
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {l.title && <span className="max-w-[16rem] truncate text-xs text-mute">{l.title}</span>}
                            {l.utm_campaign && (
                              <Link
                                href={`/admin/campaigns?c=${encodeURIComponent(l.utm_campaign)}`}
                                className="tag bg-accent-tint text-accent-ink hover:bg-accent hover:text-white"
                              >
                                {l.utm_campaign}
                              </Link>
                            )}
                            <span className="text-xs font-semibold sm:hidden">{l.clicks_total} {l.clicks_total === 1 ? "click" : "clicks"}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden max-w-[20rem] truncate px-5 py-3.5 text-ink/80 md:table-cell" title={l.destination_url}>
                      {l.destination_url}
                    </td>
                    <td className="hidden px-5 py-3.5 sm:table-cell">
                      <div className="flex items-end justify-end gap-3">
                        <Sparkline values={week} />
                        <span className="w-8 text-right text-base font-semibold">{l.clicks_7d}</span>
                      </div>
                    </td>
                    <td className="hidden px-5 py-3.5 text-right text-base font-semibold sm:table-cell">{l.clicks_total.toLocaleString("en-GB")}</td>
                    <td className="px-4 py-3.5 text-right sm:px-5"><CopyButton value={shortUrl(l.host, l.slug)} /></td>
                  </tr>
                );
              })}
              {links.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <p className="font-bold">{filtered ? "No links match." : "No links yet."}</p>
                    <p className="mt-1 text-sm text-mute">
                      {filtered ? (
                        <Link href="/admin" className="font-semibold text-accent-deep underline underline-offset-4">Clear the filter</Link>
                      ) : (
                        "Create your first one above."
                      )}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
