// Checks the shape of the Microsoft settings, so a typo is caught here with a clear message instead of
// surfacing as a confusing Microsoft error. Pure: no imports from this app.

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (v: string): boolean => GUID.test(v.trim());

type Env = Record<string, string | undefined>;

/**
 * What is wrong with the Microsoft 365 settings, in words an admin can act on. Empty when they are complete and
 * well formed, or when none of them is set (Microsoft is simply off). Secrets are never repeated, and the IDs
 * are only described by shape.
 */
export function microsoftConfigProblems(env: Env): string[] {
  const get = (k: string) => (env[k] ?? "").trim();
  const tenant = get("MICROSOFT_TENANT_ID");
  const client = get("MICROSOFT_CLIENT_ID");
  const secret = get("MICROSOFT_CLIENT_SECRET");
  const mail = get("MAIL_FROM");
  const problems: string[] = [];
  if (!tenant && !client && !secret) {
    if (mail) problems.push("MAIL_FROM is set, but the MICROSOFT_* settings are not, so no email can be sent.");
    return problems;
  }
  const shape = "It should look like 12345678-abcd-abcd-abcd-123456789abc, with 8, 4, 4, 4 and 12 characters.";
  if (!tenant) problems.push("MICROSOFT_TENANT_ID is missing.");
  else if (!isGuid(tenant)) problems.push(`MICROSOFT_TENANT_ID is not a valid tenant ID (it has ${tenant.length} characters). ${shape} Copy the Directory (tenant) ID from the app's Overview page in Entra instead of typing it.`);
  if (!client) problems.push("MICROSOFT_CLIENT_ID is missing.");
  else if (!isGuid(client)) problems.push(`MICROSOFT_CLIENT_ID is not a valid application ID (it has ${client.length} characters). ${shape} Copy the Application (client) ID from the app's Overview page.`);
  if (!secret) problems.push("MICROSOFT_CLIENT_SECRET is missing.");
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) problems.push("MAIL_FROM is not an email address.");
  return problems;
}
