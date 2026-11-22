import { query } from "./db";
import { normaliseEmail } from "./email-core";

export type Role = "admin" | "member";
export const isRole = (v: unknown): v is Role => v === "admin" || v === "member";

export type UserRow = {
  id: number;
  email: string;
  github_login: string | null;
  role: Role;
  created_at: Date;
  last_login_at: Date | null;
  invited_by: string | null;
};

/** Emails in ADMIN_EMAILS are always admins. They are restored on startup, so the app will not let them be demoted or removed. */
export function envAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map(normaliseEmail).filter(Boolean);
}

export async function userExists(email: string): Promise<boolean> {
  const rows = await query("select 1 from users where lower(email) = $1", [normaliseEmail(email)]);
  return rows.length > 0;
}

export async function getUser(email: string): Promise<{ email: string; role: Role } | null> {
  const rows = await query<{ email: string; role: string }>("select email, role from users where lower(email) = $1", [normaliseEmail(email)]);
  const r = rows[0];
  return r ? { email: r.email, role: r.role === "admin" ? "admin" : "member" } : null;
}

export async function listUsers(): Promise<UserRow[]> {
  return query<UserRow>("select id, email, github_login, role, created_at, last_login_at, invited_by from users order by lower(email)");
}

/** Returns the stored email of the first account matching any of the given verified addresses. */
export async function matchUser(emails: string[], githubLogin?: string | null): Promise<string | null> {
  const lowered = emails.map(normaliseEmail);
  const rows = await query<{ email: string }>(
    `update users set github_login = coalesce($2, github_login)
      where id = (select id from users where lower(email) = any($1::text[]) order by id limit 1)
      returning email`,
    [lowered, githubLogin ?? null],
  );
  return rows[0]?.email ?? null;
}

export async function recordLogin(email: string): Promise<void> {
  await query("update users set last_login_at = now() where lower(email) = $1", [normaliseEmail(email)]);
}

export async function createUser(email: string, role: Role, invitedBy: string | null): Promise<string> {
  const rows = await query<{ email: string }>(
    `insert into users (email, role, invited_by) values ($1, $2, $3)
     on conflict (lower(email)) do update set email = users.email
     returning email`,
    [normaliseEmail(email), role, invitedBy],
  );
  return rows[0].email;
}

export type Change = { ok: true } | { ok: false; error: string };

/**
 * Changes someone's role. You cannot change your own, an ADMIN_EMAILS account cannot be demoted, and the
 * last admin cannot be demoted. The last check is part of the update itself, so two admins demoting each
 * other at the same moment cannot leave the app without one.
 */
export async function setUserRole(email: string, role: Role, actor: string): Promise<Change> {
  const e = normaliseEmail(email);
  if (e === normaliseEmail(actor)) return { ok: false, error: "You cannot change your own role. Ask another admin." };
  if (role === "member" && envAdminEmails().includes(e)) return { ok: false, error: "This account is listed in ADMIN_EMAILS, so it is always an admin." };
  if (!(await userExists(e))) return { ok: false, error: "That person no longer has an account." };
  const rows = await query(
    `update users set role = $2
      where lower(email) = $1
        and ($2 = 'admin' or (select count(*) from users u where u.role = 'admin' and lower(u.email) <> $1) > 0)
      returning id`,
    [e, role],
  );
  return rows.length > 0 ? { ok: true } : { ok: false, error: "That would leave the app without an admin." };
}

/** Removes an account. Its sessions and connected apps stop working straight away. Same protections as setUserRole. */
export async function removeUser(email: string, actor: string): Promise<Change> {
  const e = normaliseEmail(email);
  if (e === normaliseEmail(actor)) return { ok: false, error: "You cannot remove yourself. Ask another admin." };
  if (envAdminEmails().includes(e)) return { ok: false, error: "This account is listed in ADMIN_EMAILS, so it is always an admin. Remove it from there first." };
  if (!(await userExists(e))) return { ok: false, error: "That person no longer has an account." };
  const rows = await query(
    `delete from users
      where lower(email) = $1
        and (role <> 'admin' or (select count(*) from users u where u.role = 'admin' and lower(u.email) <> $1) > 0)
      returning id`,
    [e],
  );
  if (rows.length === 0) return { ok: false, error: "That would leave the app without an admin." };
  await query("delete from oauth_tokens where lower(user_email) = $1", [e]);
  return { ok: true };
}
