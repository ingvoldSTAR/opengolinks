import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getGallery, listItems } from "@/lib/galleries";
import { GALLERY_CSP, renderGalleryHtml } from "@/lib/gallery-render";

/** The gallery as visitors will see it, including unpublished ones. Buttons do nothing here, so previews never count. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new NextResponse("Unauthorised", { status: 401 });

  const { id } = await ctx.params;
  const gallery = Number.isInteger(Number(id)) ? await getGallery(Number(id)) : null;
  if (!gallery) return new NextResponse("Not found", { status: 404 });

  const html = renderGalleryHtml(gallery, await listItems(gallery.id), { itemHref: () => "#" });
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": GALLERY_CSP,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
