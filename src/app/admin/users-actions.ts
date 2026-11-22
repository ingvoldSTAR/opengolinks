"use server";

import { appTimezone } from "@/lib/timezone";
import { APP_NAME } from "@/lib/brand";
import { revalidatePath } from "next/cache";
import { adminOnlyError, requireAdmin, sessionIdentity } from "@/lib/auth";
import { invitationMail } from "@/lib/email-core";
import { currentOrigin } from "@/lib/host";
import { createInvitation, getInvitation, inviteLink, markEmailed, revokeInvitation } from "@/lib/invitations";
import { mailConfigured, sendMail } from "@/lib/mailer";
import { rateLimit } from "@/lib/ratelimit";
import { isRole, removeUser, setUserRole, type Role } from "@/lib/users";

/** What an invitation action reports: the link to copy, and whether the email went out (and if not, why). */
export type InviteState = { error?: string; ok?: string; link?: string; emailed?: boolean; emailFailed?: boolean; emailNote?: string } | undefined;
type State = { error?: string; ok?: string } | undefined;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const day = (d: Date) => new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: appTimezone() });

/** Common to inviting and re-inviting: make the invitation, email it when email is set up, and return the link. */
async function invite(emailInput: string, role: Role): Promise<InviteState> {
  const actor = (await sessionIdentity()) ?? "";
  const gate = await rateLimit("invite", 30, 60, actor || "password");
  if (!gate.allowed) return { error: "Too many invitations in a short time. Try again later." };

  const created = await createInvitation(emailInput, role, actor || "An admin");
  if (!created.ok) return { error: created.error };
  const link = inviteLink(await currentOrigin(), created.token);

  let emailed = false;
  let emailFailed = false;
  let emailNote: string | undefined;
  if (mailConfigured()) {
    const mail = invitationMail({ appName: APP_NAME, inviter: actor || "An admin", role, link, expires: day(created.invitation.expires_at), to: created.invitation.email });
    const sent = await sendMail({ to: created.invitation.email, subject: mail.subject, text: mail.text, html: mail.html });
    emailed = sent.ok;
    if (sent.ok) await markEmailed(created.invitation.id);
    else {
      emailFailed = true;
      emailNote = sent.reason;
    }
  } else {
    emailNote = "Email is not set up, so no email was sent.";
  }
  revalidatePath("/admin/users");
  return { ok: `Invitation ready for ${created.invitation.email}.`, link, emailed, emailFailed, emailNote };
}

export async function inviteAction(_prev: InviteState, fd: FormData): Promise<InviteState> {
  await requireAdmin();
  const denied = await adminOnlyError();
  if (denied) return denied;
  const role = text(fd, "role");
  return invite(text(fd, "email"), isRole(role) ? role : "member");
}

/** Replaces the pending invitation with a fresh one (new link, expiry restarted) and emails it again. */
export async function resendInviteAction(_prev: InviteState, fd: FormData): Promise<InviteState> {
  await requireAdmin();
  const denied = await adminOnlyError();
  if (denied) return denied;
  const existing = await getInvitation(Number(fd.get("id")));
  if (!existing) return { error: "That invitation no longer exists." };
  return invite(existing.email, existing.role);
}

export async function revokeInviteAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const denied = await adminOnlyError();
  if (denied) return denied;
  await revokeInvitation(Number(fd.get("id")));
  revalidatePath("/admin/users");
  return { ok: "Invitation cancelled." };
}

export async function setRoleAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const denied = await adminOnlyError();
  if (denied) return denied;
  const role = text(fd, "role");
  if (!isRole(role)) return { error: "Choose a role." };
  const result = await setUserRole(text(fd, "email"), role, (await sessionIdentity()) ?? "");
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/users");
  return { ok: "Saved." };
}

export async function removeUserAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const denied = await adminOnlyError();
  if (denied) return denied;
  const result = await removeUser(text(fd, "email"), (await sessionIdentity()) ?? "");
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/users");
  return { ok: "Removed." };
}
