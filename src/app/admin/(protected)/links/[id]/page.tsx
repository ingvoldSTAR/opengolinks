import { DomainKey } from "@/components/DomainTag";
import Link from "next/link";
import { appTimezone } from "@/lib/timezone";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { inputClass, labelClass } from "@/components/styles";
import { CopyButton } from "@/components/CopyButton";
import { DailyBars } from "@/components/DailyBars";
import { QrPanel } from "@/components/QrPanel";
import { UtmFields } from "@/components/UtmFields";
import { clicksByDay, getLink, qrScanCounts, topCountries, topDevices, topReferrers, type LabelCount } from "@/lib/links";
import { getQrColours } from "@/lib/qrColours";
import { qrTarget, shortUrl } from "@/lib/url";
import { deleteLinkAction, updateLinkAction } from "../../../actions";

function TopList({ title, rows }: { title: string; rows: LabelCount[] }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-mute">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-3">
            <span className="truncate">{r.label}</span>
            <span className="tabular-nums text-mute">{r.n}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-mute">No data yet</li>}
      </ul>
    </div>
  );
}

export default async function LinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const link = Number.isInteger(Number(id)) ? await getLink(Number(id)) : null;
  if (!link) notFound();

  const [days, refs, countries, devices, scans, qrColours] = await Promise.all([
    clicksByDay(link.id),
    topReferrers(link.id),
    topCountries(link.id),
    topDevices(link.id),
    qrScanCounts(link.id),
    getQrColours("link", link.id),
  ]);
  const url = shortUrl(link.host, link.slug);

  return (
    <div className="space-y-6">
      {created && (
        <div role="status" className="rise flex flex-col gap-3 rounded-2xl bg-ink p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-bold text-white/80">Link created</div>
            <div className="mt-0.5 truncate text-xl font-extrabold">{url.replace(/^https?:\/\//, "")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={url} label="Copy link" />
            <Link href="/admin" className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10">Create another</Link>
          </div>
        </div>
      )}
      <div>
        <Link href="/admin" className="text-sm font-semibold text-mute hover:text-accent-deep">&larr; Back to links</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight sm:text-3xl"><DomainKey host={link.host} id={link.domain_id} hasIcon={link.has_icon} /><span className="min-w-0 break-all"><span className="text-mute">{link.host}/</span>{link.slug}</span></h1>
          <CopyButton value={url} />
          <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-deep">Open</a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-lg font-extrabold">Details</h2>
            <ActionForm action={updateLinkAction} className="mt-4 space-y-4">
              <input type="hidden" name="id" value={link.id} />
              <div>
                <label htmlFor="destination" className={labelClass}>Destination</label>
                <input id="destination" name="destination" required defaultValue={link.destination_url} className={inputClass} />
              </div>
              <UtmFields defaults={link} />
              <div>
                <label htmlFor="title" className={labelClass}>Title</label>
                <input id="title" name="title" defaultValue={link.title ?? ""} className={inputClass} />
              </div>
              <div>
                <label htmlFor="notes" className={labelClass}>Notes</label>
                <textarea id="notes" name="notes" rows={3} defaultValue={link.notes ?? ""} className={inputClass} />
              </div>
              <div>
                <label htmlFor="redirect_code" className={labelClass}>Redirect type</label>
                <select id="redirect_code" name="redirect_code" defaultValue={String(link.redirect_code)} className={inputClass}>
                  <option value="302">302, temporary (changes take effect straight away)</option>
                  <option value="301">301, permanent (browsers cache it)</option>
                </select>
              </div>
              <p className="text-xs text-mute">
                The domain and slug are fixed after creation so printed QR codes keep working. Change the destination instead.
              </p>
              <SubmitButton>Save changes</SubmitButton>
            </ActionForm>
          </section>

          <section className="card p-5">
            <h2 className="text-lg font-extrabold">Delete link</h2>
            <p className="mt-1 text-sm text-mute">Any QR code or printed copy of this link will stop working.</p>
            <form action={deleteLinkAction} className="mt-3">
              <input type="hidden" name="id" value={link.id} />
              <ConfirmButton message={`Delete ${link.host}/${link.slug}?`}>Delete link</ConfirmButton>
            </form>
          </section>
        </div>

        <div className="space-y-6">
          <QrPanel id={link.id} target={qrTarget(link.host, link.slug)} kind="link" host={link.host} initial={qrColours} />

          <section className="card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-extrabold">Clicks, last 30 days</h2>
              <p className="text-sm text-mute">
                <span className="font-semibold text-ink">{link.clicks_total}</span> total, {link.clicks_7d} in 7 days
              </p>
            </div>
            <p className="mt-2 text-sm text-mute">
              <span className="font-semibold text-ink">{scans.total}</span> of these came from scanning this link&apos;s QR code
              ({scans.d7} in 7 days). QR codes printed before this was added carry no marker, so their scans count as ordinary clicks.
            </p>
            <div className="mt-4"><DailyBars data={days} /></div>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <TopList title="Referrers" rows={refs} />
              <TopList title="Countries" rows={countries} />
              <TopList title="Devices" rows={devices} />
            </div>
            <p className="mt-4 text-xs text-mute">Bots and link preview crawlers are not counted. Days follow {appTimezone()} time.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
