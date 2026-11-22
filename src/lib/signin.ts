import { acceptInvitation } from "./invitations";
import { normaliseEmail } from "./email-core";
import { matchUser } from "./users";

export type SignIn = { ok: true; email: string } | { ok: false; message: string };

/**
 * The common last step of every provider (GitHub, Microsoft, Google): turn the addresses the provider has
 * VERIFIED into an account. With an invitation token the person is first offered the invitation, which is
 * accepted only if it was for one of those addresses. Otherwise they must already have an account.
 * Only verified addresses may be passed in, or anyone could claim someone else's.
 */
export async function completeSignIn(p: { verifiedEmails: string[]; githubLogin?: string | null; inviteToken?: string | null }): Promise<SignIn> {
  const emails = [...new Set(p.verifiedEmails.map(normaliseEmail).filter(Boolean))];
  if (emails.length === 0) return { ok: false, message: "The provider did not give a verified email address." };

  let inviteProblem: string | null = null;
  if (p.inviteToken) {
    const accepted = await acceptInvitation(p.inviteToken, emails);
    if (accepted.ok) return { ok: true, email: accepted.email };
    inviteProblem =
      accepted.reason === "mismatch"
        ? "This invitation is for a different email address. Sign in with the account that uses the address you were invited at."
        : "This invitation has expired or was already used.";
  }

  const email = await matchUser(emails, p.githubLogin ?? null);
  if (email) return { ok: true, email };
  return { ok: false, message: inviteProblem ?? "No account for this sign-in. Ask an admin to invite you." };
}
