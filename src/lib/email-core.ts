// Small pure helpers for email addresses and the invitation email. No imports from this app, so they can be tested alone.

export const normaliseEmail = (raw: string): string => raw.trim().toLowerCase();

/** A plausible address: one @, no spaces, a dot in the domain, and a sensible length. Not a full RFC check on purpose. */
export function validEmail(raw: string): boolean {
  const e = normaliseEmail(raw);
  return e.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/.test(e);
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type InvitationMail = { subject: string; text: string; html: string };

/** The invitation email. Everything that comes from a person (the inviter's name or address) is escaped in the HTML part. */
export function invitationMail(p: { appName: string; inviter: string; role: "admin" | "member"; link: string; expires: string; to: string }): InvitationMail {
  const role = p.role === "admin" ? "an admin" : "a member";
  const subject = `You are invited to ${p.appName}`;
  const text = [
    `${p.inviter} invited you to ${p.appName} as ${role}.`,
    "",
    `Accept the invitation: ${p.link}`,
    "",
    `Sign in with the account that uses ${p.to}. The link works once and expires on ${p.expires}.`,
    "",
    "If you were not expecting this, you can ignore it.",
  ].join("\n");
  const html = `<div style="font:16px/1.5 system-ui,Segoe UI,sans-serif;color:#18181b;max-width:32rem">
<p><strong>${escapeHtml(p.inviter)}</strong> invited you to ${escapeHtml(p.appName)} as ${role}.</p>
<p><a href="${escapeHtml(p.link)}" style="display:inline-block;background:#3f3f46;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px">Accept the invitation</a></p>
<p style="color:#52525b;font-size:14px">Sign in with the account that uses ${escapeHtml(p.to)}. The link works once and expires on ${escapeHtml(p.expires)}.</p>
<p style="color:#52525b;font-size:14px">If you were not expecting this, you can ignore it.</p>
</div>`;
  return { subject, text, html };
}
