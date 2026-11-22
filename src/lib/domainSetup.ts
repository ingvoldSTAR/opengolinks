import { after } from "next/server";
import { refreshFavicon } from "./favicon";
import { createDomain } from "./links";
import { apexUrl, parseHostInput } from "./validate";

export type AddedDomain = { ok: true; id: number; host: string; home: string | null } | { ok: false; error: string; duplicate?: boolean };

/**
 * Adds a domain the way the Domains page does: visitors with no valid short link go to the main website,
 * and the brand icon is fetched after the response is sent.
 */
export async function addDomainWithDefaults(input: string): Promise<AddedDomain> {
  const host = parseHostInput(input);
  if (!host.ok) return { ok: false, error: host.error };
  const home = apexUrl(host.value);
  try {
    const id = await createDomain(host.value, home, home);
    after(() => refreshFavicon(id, host.value).catch((e) => console.error("[favicon]", host.value, e instanceof Error ? e.message : e)));
    return { ok: true, id, host: host.value, home };
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") return { ok: false, error: "That domain is already added.", duplicate: true };
    throw e;
  }
}
