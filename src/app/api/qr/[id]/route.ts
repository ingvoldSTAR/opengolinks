import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getLink } from "@/lib/links";
import { qrResponse } from "@/lib/qr";
import { qrTarget } from "@/lib/url";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new NextResponse("Unauthorised", { status: 401 });

  const { id } = await ctx.params;
  const link = Number.isInteger(Number(id)) ? await getLink(Number(id)) : null;
  if (!link) return new NextResponse("Not found", { status: 404 });

  return qrResponse(qrTarget(link.host, link.slug), `${link.host}-${link.slug}`, req.nextUrl.searchParams);
}
