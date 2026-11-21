import { DomainKey } from "@/components/DomainTag";
import Link from "next/link";
import { appTimezone } from "@/lib/timezone";
import { DailyBars } from "@/components/DailyBars";
import { campaignChannels, campaignClicksByDay, listCampaigns, listLinks } from "@/lib/links";
import { cleanUtmValue } from "@/lib/utm";

export const dynamic = "force-dynamic";

const card = "card p-5";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const selected = cleanUtmValue(c);
  return selected ? <CampaignDetail campaign={selected} /> : <CampaignList />;
}

async function CampaignList() {
  const campaigns = await listCampaigns();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Campaigns</h1>
        <p className="mt-1 text-sm text-mute">
          Clicks grouped by the campaign set in each link&apos;s Campaign tracking section. Bots and link previews are not counted.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/20 p-8 text-center text-sm text-mute">
          No campaigns yet. Open a link (or create one) and fill in <span className="font-medium">Campaign tracking</span>.
          Links with the same campaign name are grouped here.
        </div>
      ) : (
        <div className="overflow-hidden card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-mute">
              <tr>
                <th className="px-5 py-3.5 font-bold">Campaign</th>
                <th className="px-5 py-3.5 text-right font-bold">Links</th>
                <th className="px-5 py-3.5 text-right font-bold">7 days</th>
                <th className="px-5 py-3.5 text-right font-bold">30 days</th>
                <th className="px-5 py-3.5 text-right font-bold">Total</th>
                <th className="px-5 py-3.5 text-right font-bold">QR scans</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((row) => (
                <tr key={row.campaign} className="border-b border-line last:border-0">
                  <td className="px-5 py-4">
                    <Link href={`/admin/campaigns?c=${encodeURIComponent(row.campaign)}`} className="font-medium text-accent-deep hover:underline">
                      {row.campaign}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-right text-base font-semibold">{row.links}</td>
                  <td className="px-5 py-4 text-right text-base font-semibold">{row.clicks_7d}</td>
                  <td className="px-5 py-4 text-right text-base font-semibold">{row.clicks_30d}</td>
                  <td className="px-5 py-4 text-right text-base font-semibold">{row.clicks_total}</td>
                  <td className="px-5 py-4 text-right text-base font-semibold">{row.qr_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function CampaignDetail({ campaign }: { campaign: string }) {
  const [days, channels, links] = await Promise.all([
    campaignClicksByDay(campaign),
    campaignChannels(campaign),
    listLinks(undefined, undefined, campaign),
  ]);
  const total = links.reduce((n, l) => n + l.clicks_total, 0);
  const last7 = links.reduce((n, l) => n + l.clicks_7d, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/campaigns" className="text-sm font-semibold text-mute hover:text-accent-deep">&larr; All campaigns</Link>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight">{campaign}</h1>
        <p className="mt-1 text-sm text-mute">
          <span className="font-semibold text-ink">{total}</span> clicks in total, {last7} in the last 7 days, across {links.length}{" "}
          {links.length === 1 ? "link" : "links"}.
        </p>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-mute">No links use this campaign.</p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <section className={card}>
              <h2 className="text-lg font-extrabold">Clicks, last 30 days</h2>
              <div className="mt-4"><DailyBars data={days} /></div>
              <p className="mt-4 text-xs text-mute">Days follow {appTimezone()} time.</p>
            </section>

            <section className={card}>
              <h2 className="text-lg font-extrabold">By source and medium</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {channels.map((ch) => (
                  <li key={ch.label} className="flex justify-between gap-3">
                    <span className="truncate">{ch.label}</span>
                    <span className="tabular-nums text-mute">{ch.n}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="overflow-hidden card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-mute">
                <tr>
                  <th className="px-5 py-3.5 font-bold">Short link</th>
                  <th className="px-5 py-3.5 font-bold">Source / medium</th>
                  <th className="px-5 py-3.5 text-right font-bold">7 days</th>
                  <th className="px-5 py-3.5 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <DomainKey host={l.host} id={l.domain_id} hasIcon={l.has_icon} size={28} />
                        <Link href={`/admin/links/${l.id}`} className="text-[15px] font-extrabold hover:text-accent-deep hover:underline">
                          /{l.slug}
                        </Link>
                      </div>
                      {l.title && <div className="text-xs text-mute">{l.title}</div>}
                    </td>
                    <td className="px-5 py-4 text-ink/80">
                      {l.utm_source ?? "(no source)"} / {l.utm_medium ?? "(no medium)"}
                    </td>
                    <td className="px-5 py-4 text-right text-base font-semibold">{l.clicks_7d}</td>
                    <td className="px-5 py-4 text-right text-base font-semibold">{l.clicks_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
