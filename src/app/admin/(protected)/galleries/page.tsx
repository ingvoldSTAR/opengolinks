import { DomainKey } from "@/components/DomainTag";
import { DrawerButton } from "@/components/Drawer";
import { GalleryIcon } from "@/components/Icons";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { inputClass, labelClass } from "@/components/styles";
import { listGalleries } from "@/lib/galleries";
import { listDomains } from "@/lib/links";
import { createGalleryAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function GalleriesPage() {
  const [galleries, domains] = await Promise.all([listGalleries(), listDomains()]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-extrabold tracking-tight">Galleries</h1>
          <p className="mt-1 text-sm text-mute">
            A gallery is a small branded page, often used as a &ldquo;link in bio&rdquo;. It lives at a short address on one of your
            domains, such as <span className="font-medium">go.example.com/team</span>, and shows buttons, social icons, images and a video.
            Clicks on each button are counted.
          </p>
        </div>
        {domains.length > 0 && (
          <DrawerButton
            label="New gallery"
            title="New gallery"
            icon={<GalleryIcon />}
            description="Pick where it lives and give it a title. You add buttons, icons and images on the next screen."
          >
            <ActionForm action={createGalleryAction} className="space-y-5">
              <div>
                <label htmlFor="domain_id" className={labelClass}>Domain</label>
                <select id="domain_id" name="domain_id" className={inputClass}>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>{d.host}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="slug" className={labelClass}>Slug</label>
                <input id="slug" name="slug" placeholder="bio" autoComplete="off" className={inputClass} />
                <p className="mt-1 text-xs text-mute">The address after the domain, for example team. Leave blank to choose one for you.</p>
              </div>
              <div>
                <label htmlFor="title" className={labelClass}>Title</label>
                <input id="title" name="title" required maxLength={80} placeholder="Acme, find us everywhere" autoComplete="off" className={inputClass} data-autofocus />
              </div>
              <SubmitButton>Create gallery</SubmitButton>
            </ActionForm>
          </DrawerButton>
        )}
      </div>

      <section className="overflow-hidden card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-mute">
            <tr>
              <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider">Gallery</th>
              <th className="px-5 py-3.5 text-right font-bold">Items</th>
              <th className="px-5 py-3.5 text-right font-bold">Views</th>
              <th className="px-5 py-3.5 text-right font-bold">Clicks</th>
            </tr>
          </thead>
          <tbody>
            {galleries.map((g) => (
              <tr key={g.id} className="border-b border-line last:border-0">
                <td className="px-5 py-4">
                  <Link href={`/admin/galleries/${g.id}`} className="text-[15px] font-extrabold hover:text-accent-deep hover:underline">{g.title}</Link>
                  {!g.published && (
                    <span className="tag ml-2 bg-ink/10 text-mute">Draft</span>
                  )}
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-mute"><DomainKey host={g.host} id={g.domain_id} hasIcon={g.has_icon} size={22} />{g.host}/{g.slug}</div>
                </td>
                <td className="px-5 py-4 text-right text-base font-semibold">{g.item_count}</td>
                <td className="px-5 py-4 text-right text-base font-semibold">{g.views_total}</td>
                <td className="px-5 py-4 text-right text-base font-semibold">{g.clicks_total}</td>
              </tr>
            ))}
            {galleries.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-mute">No galleries yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
