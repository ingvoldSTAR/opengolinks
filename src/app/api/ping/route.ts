export const dynamic = "force-dynamic";

/** Lets the Domains page confirm that a hostname really reaches this app over HTTPS. */
export async function GET() {
  return new Response("opengolinks", { headers: { "cache-control": "no-store", "content-type": "text/plain" } });
}
