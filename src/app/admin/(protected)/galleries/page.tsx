import Link from "next/link";
import { ActionForm, SubmitButton, inputClass, labelClass } from "@/components/forms";
import { listGalleries } from "@/lib/galleries";
import { listDomains } from "@/lib/links";
import { createGalleryAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function GalleriesPage() {
  const [galleries, domains] = await Promise.all([listGalleries(), listDomains()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Galleries</h1>
        <p className="mt-1 text-sm text-licorice/70">
          A gallery is a small branded page, often used as a &ldquo;link in bio&rdquo;. It lives at a short address on one of your
          domains, such as <span className="font-medium">go.example.com/team</span>, and shows buttons, social icons, images and a video.
          Clicks on each button are counted.
        </p>
      </div>

      <section className="rounded-lg border border-licorice/10 bg-white p-5">
        <h2 className="text-sm font-semibold">New gallery</h2>
        {domains.length === 0 ? (
          <p className="mt-3 text-sm">
            Add a domain first on the <Link href="/admin/domains" className="text-cobalt underline">Domains</Link> page.
          </p>
        ) : (
          <ActionForm action={createGalleryAction} className="mt-4">
            <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
              <div>
                <label htmlFor="domain_id" className={labelClass}>Domain and slug</label>
                <div className="flex gap-2">
                  <select id="domain_id" name="domain_id" className={`${inputClass} max-w-[55%]`}>
                    {domains.map((d) => (
                      <option key={d.id} value={d.id}>{d.host}</option>
                    ))}
                  </select>
                  <input name="slug" placeholder="bio" aria-label="Slug" className={inputClass} />
                </div>
              </div>
              <div>
                <label htmlFor="title" className={labelClass}>Title</label>
                <input id="title" name="title" required maxLength={80} placeholder="Acme, find us everywhere" className={inputClass} />
              </div>
            </div>
            <div className="mt-4"><SubmitButton>Create gallery</SubmitButton></div>
          </ActionForm>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-licorice/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-licorice/10 text-xs uppercase tracking-wide text-licorice/60">
            <tr>
              <th className="px-4 py-3 font-medium">Gallery</th>
              <th className="px-4 py-3 text-right font-medium">Items</th>
              <th className="px-4 py-3 text-right font-medium">Views</th>
              <th className="px-4 py-3 text-right font-medium">Clicks</th>
            </tr>
          </thead>
          <tbody>
            {galleries.map((g) => (
              <tr key={g.id} className="border-b border-licorice/5 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/galleries/${g.id}`} className="font-medium text-cobalt hover:underline">{g.title}</Link>
                  {!g.published && (
                    <span className="ml-2 rounded-full bg-licorice/10 px-2 py-0.5 text-xs font-medium text-licorice/70">Draft</span>
                  )}
                  <div className="text-xs text-licorice/60">{g.host}/{g.slug}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{g.item_count}</td>
                <td className="px-4 py-3 text-right tabular-nums">{g.views_total}</td>
                <td className="px-4 py-3 text-right tabular-nums">{g.clicks_total}</td>
              </tr>
            ))}
            {galleries.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-licorice/60">No galleries yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
