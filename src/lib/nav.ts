/** A path inside the admin area to return to after signing in. Anything else, such as another site, is ignored. */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  if (!/^\/admin(\/|\?|$)/.test(raw)) return null;
  if (/[\\\u0000-\u001f]/.test(raw)) return null;
  return raw;
}
