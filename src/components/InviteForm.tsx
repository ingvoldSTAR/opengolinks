"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { inviteAction, resendInviteAction, type InviteState } from "@/app/admin/users-actions";
import { CopyButton } from "./CopyButton";
import { inputClass, labelClass } from "./styles";

/** The result of an invitation: whether the email went, and the link to share by hand if it did not (or as a backup). */
function InviteResult({ state }: { state: NonNullable<InviteState> }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-3 text-sm font-medium text-danger-ink">
        {state.error}
      </p>
    );
  }
  return (
    <div role="status" className="mt-4 rounded-xl bg-ground p-4 text-sm">
      <p className="font-bold">{state.ok}</p>
      {state.emailed ? (
        <p className="mt-1 font-semibold text-ok">The invitation email was sent.</p>
      ) : (
        // A failed send is a problem worth seeing; email simply not being set up is not.
        <p className={`mt-1 ${state.emailFailed ? "font-medium text-danger-ink" : "text-mute"}`}>{state.emailNote}</p>
      )}
      {state.link && (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
            <div className="min-w-0 truncate font-mono text-xs">{state.link}</div>
            <CopyButton value={state.link} label="Copy link" />
          </div>
          <p className="mt-2 text-xs text-mute">
            The link works once, only for that email address, for 7 days. {state.emailed ? "You can also share it yourself." : "Share it yourself, for example in Teams."}
          </p>
        </>
      )}
    </div>
  );
}

const roleTile = "flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-tint";

/** Invite someone by email. Stays open after sending so the link can be copied. */
export function InviteForm({ emailOn }: { emailOn: boolean }) {
  const [state, formAction] = useActionState(inviteAction, undefined);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (state?.ok) setEmail("");
  }, [state]);
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <div>
        <label htmlFor="invite-email" className={labelClass}>Email address</label>
        <input id="invite-email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" className={inputClass} data-autofocus />
        <p className="mt-1 text-xs text-mute">They must sign in with an account that uses this exact address.</p>
      </div>
      <fieldset>
        <legend className={labelClass}>Role</legend>
        <div className="space-y-2">
          <label className={roleTile}>
            <input type="radio" name="role" value="member" defaultChecked className="mt-1" />
            <span>
              <span className="block text-sm font-bold">Member</span>
              <span className="block text-xs text-mute">Creates and edits links, QR codes and galleries, and reads the results.</span>
            </span>
          </label>
          <label className={roleTile}>
            <input type="radio" name="role" value="admin" className="mt-1" />
            <span>
              <span className="block text-sm font-bold">Admin</span>
              <span className="block text-xs text-mute">Also manages people, domains and imports.</span>
            </span>
          </label>
        </div>
      </fieldset>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-transparent bg-accent px-5 py-2.5 text-sm font-extrabold italic text-white transition-colors hover:bg-accent-deep disabled:opacity-50"
      >
        {pending ? "Working..." : emailOn ? "Send invitation" : "Create invitation"}
      </button>
      {!emailOn && !state && <p className="text-xs text-mute">Email is not set up, so you will get a link to send yourself.</p>}
      {state && <InviteResult state={state} />}
    </form>
  );
}

/** Replaces a pending invitation with a fresh one and shows the new link. */
export function ResendInvite({ id }: { id: number }) {
  const [state, formAction] = useActionState(resendInviteAction, undefined);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold transition-colors hover:border-accent hover:text-accent-deep disabled:opacity-50"
        >
          {pending ? "Working..." : "Resend"}
        </button>
      </form>
      {state && <InviteResult state={state} />}
    </div>
  );
}
