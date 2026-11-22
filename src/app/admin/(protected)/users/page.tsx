import { appTimezone } from "@/lib/timezone";
import Link from "next/link";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { DrawerButton } from "@/components/Drawer";
import { InviteForm, ResendInvite } from "@/components/InviteForm";
import { UsersIcon } from "@/components/Icons";
import { sessionUser } from "@/lib/auth";
import { adminsOnly } from "@/lib/gate";
import { INVITE_DAYS, listInvitations } from "@/lib/invitations";
import { mailConfigured } from "@/lib/mailer";
import { signInSettingProblems, passwordLoginEnabled } from "@/lib/providers";
import { envAdminEmails, listUsers } from "@/lib/users";
import { removeUserAction, revokeInviteAction, setRoleAction } from "../../users-actions";

export const dynamic = "force-dynamic";

const when = (d: Date | null) => (d ? new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: appTimezone() }) : "Never");
const select = "rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold";

function Role({ role }: { role: "admin" | "member" }) {
  return <span className={`tag ${role === "admin" ? "bg-accent-tint text-accent-ink" : "bg-ground text-ink/80"}`}>{role === "admin" ? "Admin" : "Member"}</span>;
}

export default async function UsersPage() {
  const denied = await adminsOnly();
  if (denied) return denied;
  const me = (await sessionUser())?.email ?? "";
  const [users, invitations] = await Promise.all([listUsers(), listInvitations()]);
  const fixed = new Set(envAdminEmails());
  const password = passwordLoginEnabled();
  const emailOn = mailConfigured();
  const problems = signInSettingProblems();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">People</h1>
          <p className="mt-1 max-w-2xl text-sm text-mute">
            Everyone signs in with their own work account. Invite a teammate, choose whether they are a member or an admin, and remove them when they leave.
          </p>
        </div>
        <DrawerButton
          label="Invite someone"
          title="Invite someone"
          icon={<UsersIcon />}
          description={`They get a single-use link that works for ${INVITE_DAYS} days${emailOn ? ", by email" : ""}. When they sign in with the invited address, their account is created.`}
        >
          <InviteForm emailOn={emailOn} />
        </DrawerButton>
      </div>

      {(problems.length > 0 || password) && (
        <p role="status" className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger-ink">
          {problems.length > 0 ? "A sign-in setting needs fixing. " : "The shared password is still on. "}
          <Link href="/admin/settings" className="underline">See Settings</Link>.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">Accounts ({users.length})</h2>
        <div className="card divide-y divide-line">
          {users.map((u) => {
            const isMe = u.email.toLowerCase() === me.toLowerCase();
            const locked = isMe ? "You" : fixed.has(u.email.toLowerCase()) ? "Set in ADMIN_EMAILS" : null;
            return (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold">{u.email}</span>
                    <Role role={u.role} />
                    {isMe && <span className="tag bg-ground text-mute">You</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-mute">
                    Last sign-in: {when(u.last_login_at)}
                    {u.github_login ? `, GitHub: ${u.github_login}` : ""}
                    {u.invited_by ? `, invited by ${u.invited_by}` : ""}
                  </div>
                </div>
                {locked ? (
                  <span className="text-xs font-semibold text-mute">{locked === "You" ? "This is you" : locked}</span>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionForm action={setRoleAction}>
                      <input type="hidden" name="email" value={u.email} />
                      <div className="flex items-center gap-2">
                        <select name="role" defaultValue={u.role} aria-label={`Role for ${u.email}`} className={select}>
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                        <SubmitButton variant="quiet">Save</SubmitButton>
                      </div>
                    </ActionForm>
                    <ActionForm action={removeUserAction}>
                      <input type="hidden" name="email" value={u.email} />
                      <ConfirmButton message={`Remove ${u.email}? They are signed out straight away and their connected apps stop working.`}>Remove</ConfirmButton>
                    </ActionForm>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">Pending invitations ({invitations.length})</h2>
        {invitations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink/20 p-6 text-center text-sm text-mute">No invitations waiting.</p>
        ) : (
          <div className="card divide-y divide-line">
            {invitations.map((i) => (
              <div key={i.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold">{i.email}</span>
                    <Role role={i.role} />
                    {i.expired && <span className="tag bg-danger-tint text-danger-ink">Expired</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-mute">
                    Invited by {i.invited_by} on {when(i.created_at)}. {i.expired ? "Expired" : "Expires"} {when(i.expires_at)}.
                    {i.emailed_at ? " Email sent." : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <ResendInvite id={i.id} />
                  <ActionForm action={revokeInviteAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <ConfirmButton message={`Cancel the invitation for ${i.email}? Its link stops working.`}>Cancel</ConfirmButton>
                  </ActionForm>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
