import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getGallery } from "@/lib/galleries";
import { qrResponse } from "@/lib/qr";
import { qrTarget } from "@/lib/url";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new NextResponse("Unauthorised", { status: 401 });

  const { id } = await ctx.params;
  const gallery = Number.isInteger(Number(id)) ? await getGallery(Number(id)) : null;
  if (!gallery) return new NextResponse("Not found", { status: 404 });

  return qrResponse(qrTarget(gallery.host, gallery.slug), `${gallery.host}-${gallery.slug}`, req.nextUrl.searchParams);
}
