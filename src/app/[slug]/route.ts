import { after, NextResponse, type NextRequest } from "next/server";
import { findGallery, listItems, recordGalleryEvent } from "@/lib/galleries";
import { GALLERY_CSP, renderGalleryHtml } from "@/lib/gallery-render";
import { hostFromHeaders } from "@/lib/host";
import { countryFromHeaders, findDomain, recordClick, resolveLink } from "@/lib/links";
import { withUtm } from "@/lib/utm";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const host = hostFromHeaders(req.headers);
  const country = countryFromHeaders(req.headers);
  const via = req.nextUrl.searchParams.get("qr") === "1" ? "qr" : null;

  const link = await resolveLink(host, slug.toLowerCase());

  if (!link) {
    // Links and galleries share the slug space of a domain; a link wins if somehow both exist.
    const gallery = await findGallery(host, slug.toLowerCase());
    if (gallery?.published) {
      const items = await listItems(gallery.id);
      after(() =>
        recordGalleryEvent(gallery.id, null, {
          referrer: req.headers.get("referer"),
          country,
          userAgent: req.headers.get("user-agent"),
          via,
        }).catch((err) => console.error("gallery view not recorded", err)),
      );
      const html = renderGalleryHtml(gallery, items, { itemHref: (item) => `/${gallery.slug}/${item.id}` });
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": GALLERY_CSP,
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
      });
    }

    const domain = await findDomain(host);
    if (domain?.not_found_url) return NextResponse.redirect(domain.not_found_url, 302);
    return new NextResponse("Link not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  after(() =>
    recordClick(link.id, {
      referrer: req.headers.get("referer"),
      country,
      userAgent: req.headers.get("user-agent"),
      via,
    }).catch((err) => console.error("click not recorded", err)),
  );

  return NextResponse.redirect(withUtm(link.destination_url, link), {
    status: link.redirect_code,
    headers: { "Cache-Control": link.redirect_code === 301 ? "public, max-age=3600" : "no-store" },
  });
}
