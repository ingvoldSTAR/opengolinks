import { PING_BODY } from "@/lib/ping";

export const dynamic = "force-dynamic";

/**
 * Lets the Domains page confirm that a hostname really reaches this app over HTTPS. It answers with one fixed word,
 * and may be read from any origin: the admin's own browser uses it to check, from a visitor's point of view, that a
 * domain works (a server often cannot reach its own public addresses, so it cannot judge that alone).
 */
export async function GET() {
  return new Response(PING_BODY, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain",
      "access-control-allow-origin": "*",
    },
  });
}
