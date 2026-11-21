import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getFavicon } from "@/lib/links";

/** The stored brand icon of a domain, for the admin screens. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new NextResponse("Unauthorised", { status: 401 });
  const { id } = await ctx.params;
  const icon = Number.isInteger(Number(id)) ? await getFavicon(Number(id)) : null;
  if (!icon) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(icon.data), {
    headers: {
      "Content-Type": icon.type,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
