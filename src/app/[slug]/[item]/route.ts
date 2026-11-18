import { after, NextResponse, type NextRequest } from "next/server";
import { findClickableItem, findGallery, recordGalleryEvent } from "@/lib/galleries";
import { safeHttpUrl } from "@/lib/gallery-render";
import { hostFromHeaders } from "@/lib/host";

/** /<gallery slug>/<item id>: counts a click on a gallery button, then sends the visitor on. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string; item: string }> }) {
  const { slug, item } = await ctx.params;
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const itemId = /^\d{1,9}$/.test(item) ? Number(item) : null;
  if (itemId === null) return notFound();

  const host = hostFromHeaders(req.headers);
  const gallery = await findGallery(host, slug.toLowerCase());
  if (!gallery?.published) return notFound();

  const target = await findClickableItem(gallery.id, itemId);
  const destination = safeHttpUrl(target?.url);
  if (!target || !destination) return notFound();

  after(() =>
    recordGalleryEvent(gallery.id, target.id, {
      referrer: req.headers.get("referer"),
      country: req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry"),
      userAgent: req.headers.get("user-agent"),
      via: null,
    }).catch((err) => console.error("gallery click not recorded", err)),
  );

  return NextResponse.redirect(destination, { status: 302, headers: { "Cache-Control": "no-store" } });
}
