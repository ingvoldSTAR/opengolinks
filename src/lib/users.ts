import { query } from "./db";

export async function userExists(email: string): Promise<boolean> {
  const rows = await query("select 1 from users where lower(email) = $1", [email.toLowerCase()]);
  return rows.length > 0;
}

/** Returns the stored email of the first account matching any of the given addresses. */
export async function matchUser(emails: string[], githubLogin: string): Promise<string | null> {
  const lowered = emails.map((e) => e.toLowerCase());
  const rows = await query<{ email: string }>(
    "update users set github_login = $2 where id = (select id from users where lower(email) = any($1::text[]) order by id limit 1) returning email",
    [lowered, githubLogin],
  );
  return rows[0]?.email ?? null;
}
