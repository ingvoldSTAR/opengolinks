import type { NextRequest } from "next/server";
import { endpoints, github } from "@/lib/providers";
import { startFlow } from "@/lib/signin-flow";

export const dynamic = "force-dynamic";

/** Starts the GitHub sign-in. */
export async function GET(req: NextRequest) {
  return startFlow(req, "github", ({ redirectUri, state }) => {
    const url = new URL(`${endpoints().githubWeb}/login/oauth/authorize`);
    url.searchParams.set("client_id", github().clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "user:email");
    url.searchParams.set("state", state);
    return url;
  });
}
