/**
 * The sign-in providers and where they live. A provider is switched on by its environment variables:
 *   GitHub     GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 *   Google     GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   Microsoft  MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET   (one tenant only)
 * Microsoft's also send the invitation emails (see mailer.ts).
 */
import { microsoftConfigProblems } from "./config-core";

export type ProviderId = "github" | "microsoft" | "google";

const env = (name: string) => process.env[name]?.trim() ?? "";

export const providerLabel: Record<ProviderId, string> = { github: "GitHub", microsoft: "Microsoft 365", google: "Google" };

export function providerConfigured(id: ProviderId): boolean {
  if (id === "github") return Boolean(env("GITHUB_CLIENT_ID") && env("GITHUB_CLIENT_SECRET"));
  if (id === "google") return Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
  // Complete and well formed. A typo in an ID would only lead people to a Microsoft error page.
  return microsoftConfigProblems(process.env).filter((p) => !p.startsWith("MAIL_FROM")).length === 0 && Boolean(env("MICROSOFT_TENANT_ID"));
}

/** What is wrong with the sign-in settings, for the Settings page. Never contains a secret. */
export function signInSettingProblems(): string[] {
  return microsoftConfigProblems(process.env);
}

export const configuredProviders = (): ProviderId[] => (["microsoft", "github", "google"] as const).filter(providerConfigured);

/** Whether the shared password still works: it does while ADMIN_PASSWORD is set. Remove it to retire the password. */
export const passwordLoginEnabled = (): boolean => Boolean(env("ADMIN_PASSWORD"));

// Only tests may point the providers somewhere else.
const test = (name: string): string => (process.env.NODE_ENV !== "production" ? env(name) : "");

export const endpoints = () => ({
  githubWeb: test("GITHUB_WEB_BASE") || "https://github.com",
  githubApi: test("GITHUB_API_BASE") || "https://api.github.com",
  googleAuth: test("GOOGLE_AUTH_BASE") || "https://accounts.google.com",
  googleToken: test("GOOGLE_TOKEN_BASE") || "https://oauth2.googleapis.com",
  googleApi: test("GOOGLE_API_BASE") || "https://openidconnect.googleapis.com",
  microsoftLogin: test("MICROSOFT_LOGIN_BASE") || "https://login.microsoftonline.com",
  microsoftGraph: test("MICROSOFT_GRAPH_BASE") || "https://graph.microsoft.com",
});

export const microsoft = () => ({ tenant: env("MICROSOFT_TENANT_ID").toLowerCase(), clientId: env("MICROSOFT_CLIENT_ID"), clientSecret: env("MICROSOFT_CLIENT_SECRET") });
export const google = () => ({ clientId: env("GOOGLE_CLIENT_ID"), clientSecret: env("GOOGLE_CLIENT_SECRET") });
export const github = () => ({ clientId: env("GITHUB_CLIENT_ID"), clientSecret: env("GITHUB_CLIENT_SECRET") });
