/**
 * The time zone that decides where a "day" starts and ends in the statistics, set with the TIMEZONE
 * environment variable (an IANA name such as Europe/London). Defaults to UTC. An unknown name falls
 * back to UTC with a warning, so a typo cannot break the statistics pages.
 */
let cached: string | undefined;

export function appTimezone(): string {
  if (cached) return cached;
  const wanted = (process.env.TIMEZONE ?? "").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: wanted });
    cached = wanted;
  } catch {
    console.warn(`[config] TIMEZONE "${wanted}" is not a known time zone name. Using UTC.`);
    cached = "UTC";
  }
  return cached;
}
