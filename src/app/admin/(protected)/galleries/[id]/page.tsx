import Link from "next/link";
import { appTimezone } from "@/lib/timezone";
import { notFound } from "next/navigation";
import { AddItemForm } from "@/components/AddItemForm";
import { CopyButton } from "@/components/CopyButton";
import { DailyBars } from "@/components/DailyBars";
import { ActionForm, ConfirmButton, SubmitButton, inputClass, labelClass } from "@/components/forms";
import { QrPanel } from "@/components/QrPanel";
import { ThemeFields } from "@/components/ThemeFields";
import { galleryStats, galleryViewsByDay, getGallery, itemClickCounts, listItems, type ItemClicks } from "@/lib/galleries";
import { NETWORKS, NETWORK_LABELS } from "@/lib/gallery-icons";
import { safeImageSrc, type ItemRow } from "@/lib/gallery-render";
import { qrTarget, shortUrl } from "@/lib/url";
import {
  deleteGalleryAction,
  deleteItemAction,
  moveItemAction,
  toggleItemAction,
  updateGalleryAction,
  updateItemAction,
} from "../../../actions";

export const dynamic = "force-dynamic";

const card = "rounded-lg border border-licorice/10 bg-white p-5";
const hint = "mt-1 text-xs text-licorice/60";
const smallBtn =
  "rounded-md border border-licorice/20 bg-white px-2.5 py-1 text-xs font-medium hover:border-licorice/50 disabled:cursor-not-allowed disabled:opacity-40";

const KIND_LABEL: Record<ItemRow["kind"], string> = { link: "Button", social: "Social icon", image: "Image", video: "Video" };

function summary(item: ItemRow): string {
  if (item.kind === "social") return `${NETWORK_LABELS[item.network as keyof typeof NETWORK_LABELS] ?? item.network ?? "Social"}: ${item.url ?? ""}`;
  if (item.kind === "video") return item.label || item.url || "Video";
  return item.label || item.url || "Image";
}

function ItemCard({ item, index, total, clicks }: { item: ItemRow; index: number; total: number; clicks?: ItemClicks }) {
  const counted = item.kind !== "video";
  return (
    <li className={`rounded-md border border-licorice/10 p-3 ${item.hidden ? "bg-licorice/5" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-full bg-cobalt/10 px-2 py-0.5 text-xs font-medium text-cobalt">{KIND_LABEL[item.kind]}</span>
        <span className={`min-w-0 flex-1 truncate text-sm ${item.hidden ? "text-licorice/50 line-through" : ""}`} title={summary(item)}>
          {summary(item)}
        </span>
        {item.hidden && <span className="text-xs text-licorice/60">Hidden</span>}
        {counted && (
          <span className="text-xs tabular-nums text-licorice/70">
            {clicks?.total ?? 0} {clicks?.total === 1 ? "click" : "clicks"}
            {clicks ? ` (${clicks.d7} in 7 days)` : ""}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form action={moveItemAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="direction" value="up" />
          <button className={smallBtn} disabled={index === 0} aria-label="Move up">Up</button>
        </form>
        <form action={moveItemAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="direction" value="down" />
          <button className={smallBtn} disabled={index === total - 1} aria-label="Move down">Down</button>
        </form>
        <form action={toggleItemAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="hide" value={item.hidden ? "0" : "1"} />
          <button className={smallBtn}>{item.hidden ? "Show" : "Hide"}</button>
        </form>
        <form action={deleteItemAction} className="ml-auto">
          <input type="hidden" name="id" value={item.id} />
          <ConfirmButton message="Remove this item? Its click history stays in the totals.">Remove</ConfirmButton>
        </form>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-cobalt">Edit</summary>
        <ActionForm action={updateItemAction} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={item.id} />
          <div className="grid gap-3 md:grid-cols-2">
            {item.kind === "social" && (
              <div>
                <label htmlFor={`net-${item.id}`} className={labelClass}>Network</label>
                <select id={`net-${item.id}`} name="network" defaultValue={item.network ?? "website"} className={inputClass}>
                  {NETWORKS.map((n) => (
                    <option key={n} value={n}>{NETWORK_LABELS[n]}</option>
                  ))}
                </select>
              </div>
            )}
            {item.kind !== "social" && (
              <div>
                <label htmlFor={`label-${item.id}`} className={labelClass}>
                  {item.kind === "link" ? "Label" : item.kind === "image" ? "Description" : "Title (optional)"}
                </label>
                <input id={`label-${item.id}`} name="label" defaultValue={item.label ?? ""} maxLength={120} className={inputClass} />
              </div>
            )}
            <div>
              <label htmlFor={`url-${item.id}`} className={labelClass}>
                {item.kind === "video" ? "YouTube link" : item.kind === "image" ? "Opens when clicked (optional)" : item.kind === "social" ? "Profile link" : "Link"}
              </label>
              <input id={`url-${item.id}`} name="url" defaultValue={item.url ?? ""} className={inputClass} />
            </div>
            {item.kind === "image" && (
              <>
                <div>
                  <label htmlFor={`file-${item.id}`} className={labelClass}>Replace image (up to 250 KB)</label>
                  <input id={`file-${item.id}`} name="image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="block w-full text-sm" />
                </div>
                <div>
                  <label htmlFor={`img-${item.id}`} className={labelClass}>Or an image link</label>
                  <input id={`img-${item.id}`} name="image_url" placeholder="https://" className={inputClass} />
                </div>
              </>
            )}
          </div>
          <SubmitButton variant="quiet">Save item</SubmitButton>
        </ActionForm>
      </details>
    </li>
  );
}

export default async function GalleryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gallery = Number.isInteger(Number(id)) ? await getGallery(Number(id)) : null;
  if (!gallery) notFound();

  const [items, stats, days, clicks] = await Promise.all([
    listItems(gallery.id),
    galleryStats(gallery.id),
    galleryViewsByDay(gallery.id),
    itemClickCounts(gallery.id),
  ]);
  const clickMap = new Map(clicks.filter((c) => c.item_id !== null).map((c) => [c.item_id as number, c]));
  const removed = clicks.find((c) => c.item_id === null);
  const url = shortUrl(gallery.host, gallery.slug);
  const avatar = safeImageSrc(gallery.avatar);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/galleries" className="text-sm text-licorice/70 hover:text-licorice">Back to galleries</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{gallery.host}/{gallery.slug}</h1>
          <CopyButton value={url} />
          {gallery.published ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-sm text-cobalt hover:underline">Open</a>
          ) : (
            <span className="rounded-full bg-licorice/10 px-2 py-0.5 text-xs font-medium text-licorice/70">Draft, not visible to visitors</span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <section className={card}>
            <h2 className="text-sm font-semibold">Page</h2>
            <ActionForm action={updateGalleryAction} className="mt-4 space-y-4">
              <input type="hidden" name="id" value={gallery.id} />
              <div>
                <label htmlFor="title" className={labelClass}>Title</label>
                <input id="title" name="title" required maxLength={80} defaultValue={gallery.title} className={inputClass} />
              </div>
              <div>
                <label htmlFor="bio" className={labelClass}>Bio (optional)</label>
                <textarea id="bio" name="bio" rows={3} maxLength={500} defaultValue={gallery.bio ?? ""} className={inputClass} />
              </div>

              <div>
                <div className={labelClass}>Logo or photo (optional)</div>
                <div className="flex flex-wrap items-center gap-4">
                  {avatar && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="Current logo or photo" width={56} height={56} className="h-14 w-14 rounded-full border border-licorice/10 object-cover" />
                  )}
                  <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2">
                    <input name="avatar_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Upload an image" className="block w-full text-sm" />
                    <input name="avatar_url" placeholder="or an image link, https://" aria-label="Image link" className={inputClass} />
                  </div>
                </div>
                <p className={hint}>Up to 250 KB when uploading. Square images look best.</p>
                {avatar && (
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input type="checkbox" name="avatar_remove" /> Remove the current image
                  </label>
                )}
              </div>

              <ThemeFields
                defaults={{
                  bg_color: gallery.bg_color,
                  text_color: gallery.text_color,
                  button_color: gallery.button_color,
                  button_text_color: gallery.button_text_color,
                  button_style: gallery.button_style,
                }}
              />

              <div>
                <label htmlFor="footer" className={labelClass}>Footer (optional)</label>
                <input id="footer" name="footer" maxLength={200} defaultValue={gallery.footer ?? ""} className={inputClass} />
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="published" defaultChecked={gallery.published} className="mt-1" />
                <span>
                  <span className="font-medium">Published.</span> Untick to hide the page from visitors while you work on it. The preview still shows it.
                </span>
              </label>

              <SubmitButton>Save page</SubmitButton>
            </ActionForm>
          </section>

          <section className={card}>
            <h2 className="text-sm font-semibold">Buttons, icons and media</h2>
            <p className={hint}>Shown in this order. Social icons gather in a row under the bio, wherever they sit in the list.</p>
            {items.length === 0 ? (
              <p className="mt-4 text-sm text-licorice/60">Nothing here yet. Add your first button below.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {items.map((item, i) => (
                  <ItemCard key={item.id} item={item} index={i} total={items.length} clicks={clickMap.get(item.id)} />
                ))}
              </ul>
            )}
            {removed && (
              <p className="mt-3 text-xs text-licorice/60">
                {removed.total} {removed.total === 1 ? "click" : "clicks"} on items that were later removed are still counted in the totals.
              </p>
            )}
            <div className="mt-6 border-t border-licorice/10 pt-5">
              <h3 className="text-sm font-semibold">Add</h3>
              <AddItemForm galleryId={gallery.id} />
            </div>
          </section>

          <section className={card}>
            <h2 className="text-sm font-semibold">Delete gallery</h2>
            <p className="mt-1 text-sm text-licorice/70">The page and its statistics are removed, and the address stops working.</p>
            <form action={deleteGalleryAction} className="mt-3">
              <input type="hidden" name="id" value={gallery.id} />
              <ConfirmButton message={`Delete ${gallery.host}/${gallery.slug}?`}>Delete gallery</ConfirmButton>
            </form>
          </section>
        </div>

        <div className="space-y-6">
          <section className={card}>
            <h2 className="text-sm font-semibold">Preview</h2>
            <p className={hint}>Updates after you save. Buttons do nothing here, so previews are never counted.</p>
            <iframe
              title="Gallery preview"
              src={`/api/galleries/${gallery.id}/preview?v=${new Date(gallery.updated_at).getTime()}`}
              className="mx-auto mt-3 block h-[640px] w-full max-w-[390px] rounded-lg border border-licorice/15 bg-white"
            />
          </section>

          <section className={card}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Views, last 30 days</h2>
              <p className="text-sm text-licorice/70">
                <span className="font-semibold text-licorice">{stats.views_total}</span> total, {stats.views_7d} in 7 days
              </p>
            </div>
            <div className="mt-4"><DailyBars data={days} /></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-licorice/60">Button clicks</dt>
                <dd className="font-semibold tabular-nums">{stats.clicks_total} <span className="font-normal text-licorice/70">({stats.clicks_7d} in 7 days)</span></dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-licorice/60">Views from QR</dt>
                <dd className="font-semibold tabular-nums">{stats.qr_views}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-licorice/60">Bots and link previews are not counted. Days follow {appTimezone()} time.</p>
          </section>

          <QrPanel id={gallery.id} target={qrTarget(gallery.host, gallery.slug)} base={`/api/galleries/${gallery.id}/qr`} />
        </div>
      </div>
    </div>
  );
}
