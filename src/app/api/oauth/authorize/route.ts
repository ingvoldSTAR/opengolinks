import { NextResponse, type NextRequest } from "next/server";
import { sessionIdentity } from "@/lib/auth";
import { currentOrigin } from "@/lib/host";
import { createAuthCode, parseAuthRequest, withParams } from "@/lib/oauth";
import { mcpResource, notAdminHost } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";

const page = (message: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Cannot connect</title><body style="font:16px system-ui;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1 style="font-size:1.25rem">Cannot connect this app</h1><p>${message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</p>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/**
 * Step one of signing in: the MCP client sends the person's browser here. A bad request is refused (or sent
 * back to the client with an error), a good one goes to the consent page, which asks for GitHub sign-in first.
 */
export async function GET(req: NextRequest) {
  const hidden = await notAdminHost();
  if (hidden) return hidden;
  const result = await parseAuthRequest((n) => req.nextUrl.searchParams.get(n), await mcpResource());
  if (!result.ok) return result.redirectTo ? NextResponse.redirect(result.redirectTo, 303) : page(result.description);
  const url = new URL("/admin/connect", await currentOrigin());
  url.search = req.nextUrl.search;
  return NextResponse.redirect(url, 303);
}

/**
 * Step two: the consent page posts the person's decision here. It must come from this site (Origin check),
 * from a browser signed in as a named user, and the request is checked again from scratch.
 */
export async function POST(req: NextRequest) {
  const hidden = await notAdminHost();
  if (hidden) return hidden;
  const origin = await currentOrigin();
  if (req.headers.get("origin") !== origin) return new NextResponse("Forbidden", { status: 403 });

  const email = await sessionIdentity();
  if (!email) return page("Sign in with GitHub first, then connect the app again.");

  const form = await req.formData();
  const field = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : null;
  };
  const result = await parseAuthRequest(field, await mcpResource());
  if (!result.ok) return result.redirectTo ? NextResponse.redirect(result.redirectTo, 303) : page(result.description);
  const { request } = result;

  if (field("decision") !== "approve") {
    return NextResponse.redirect(withParams(request.redirectUri, { error: "access_denied", error_description: "The request was declined.", state: request.state, iss: origin }), 303);
  }
  const code = await createAuthCode(request, email);
  return NextResponse.redirect(withParams(request.redirectUri, { code, state: request.state, iss: origin }), 303);
}
