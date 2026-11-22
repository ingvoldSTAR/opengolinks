import { query } from "./db";
import { normaliseEmail, validEmail } from "./email-core";
import { randomToken, sha256Hex } from "./oauth-core";
import { createUser, userExists, type Role } from "./users";

export const INVITE_DAYS = 7;

export type Invitation = { id: number; email: string; role: Role; invited_by: string; created_at: Date; expires_at: Date; emailed_at: Date | null };

export const inviteLink = (origin: string, token: string): string => `${origin}/admin/invite/${token}`;

export type Created = { ok: true; token: string; invitation: Invitation } | { ok: false; error: string };

/**
 * Creates an invitation, replacing any earlier one for the same address (so "resend" is just "invite again" and
 * the old link stops working). The link carries a random token; only its hash is stored.
 */
export async function createInvitation(emailInput: string, role: Role, invitedBy: string): Promise<Created> {
  const email = normaliseEmail(emailInput);
  if (!validEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (await userExists(email)) return { ok: false, error: "That person already has an account." };
  const token = randomToken(32);
  await query("delete from invitations where lower(email) = $1", [email]);
  const rows = await query<Invitation>(
    `insert into invitations (email, role, token_hash, invited_by, expires_at)
     values ($1, $2, $3, $4, now() + ($5::int * interval '1 day'))
     returning id, email, role, invited_by, created_at, expires_at, emailed_at`,
    [email, role, sha256Hex(token), invitedBy, INVITE_DAYS],
  );
  return { ok: true, token, invitation: rows[0] };
}

export async function markEmailed(id: number): Promise<void> {
  await query("update invitations set emailed_at = now() where id = $1", [id]);
}

export async function listInvitations(): Promise<(Invitation & { expired: boolean })[]> {
  return query(
    `select id, email, role, invited_by, created_at, expires_at, emailed_at, (expires_at < now()) as expired
       from invitations order by created_at desc`,
  );
}

export async function getInvitation(id: number): Promise<Pick<Invitation, "id" | "email" | "role"> | null> {
  const rows = await query<Pick<Invitation, "id" | "email" | "role">>("select id, email, role from invitations where id = $1", [id]);
  return rows[0] ?? null;
}

export async function revokeInvitation(id: number): Promise<void> {
  await query("delete from invitations where id = $1", [id]);
}

/** A still-valid invitation for the token in a link, for showing the invitation page. */
export async function findInvitation(token: string): Promise<{ email: string; role: Role; invited_by: string; expires_at: Date } | null> {
  if (!token || token.length > 100) return null;
  const rows = await query<{ email: string; role: Role; invited_by: string; expires_at: Date }>(
    "select email, role, invited_by, expires_at from invitations where token_hash = $1 and expires_at > now()",
    [sha256Hex(token)],
  );
  return rows[0] ?? null;
}

export type Accepted = { ok: true; email: string } | { ok: false; reason: "invalid" | "mismatch" };

/**
 * Turns an invitation into an account. The person must have signed in with a provider that vouches for the
 * very address that was invited, so a forwarded link is useless to anyone else. The invitation is used up by
 * the delete, so two attempts at the same moment cannot both succeed.
 */
export async function acceptInvitation(token: string, verifiedEmails: string[]): Promise<Accepted> {
  const invitation = await findInvitation(token);
  if (!invitation) return { ok: false, reason: "invalid" };
  const invited = normaliseEmail(invitation.email);
  if (!verifiedEmails.map(normaliseEmail).includes(invited)) return { ok: false, reason: "mismatch" };
  const used = await query<{ email: string; role: Role; invited_by: string }>(
    "delete from invitations where token_hash = $1 and expires_at > now() returning email, role, invited_by",
    [sha256Hex(token)],
  );
  if (!used[0]) return { ok: false, reason: "invalid" };
  return { ok: true, email: await createUser(used[0].email, used[0].role, used[0].invited_by) };
}
