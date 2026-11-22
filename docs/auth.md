# People, sign-in and invitations

Everyone signs in as themselves, and each person is either an **admin** or a **member**. Admins invite people on the **People** page.

## Roles

| | Member | Admin |
|---|---|---|
| Links, QR codes and their colours, campaigns, galleries | yes | yes |
| Connect an AI agent (see their own connections only) | yes | yes, and see everyone's |
| Domains (add, edit, remove, icons), Rebrandly import | no | yes |
| People: invite, change roles, remove | no | yes |
| AI agent tools: add a domain | no | yes |

A person's role is read on every request, so a change or a removal takes effect at once, including for AI agents they connected.

Accounts listed in `ADMIN_EMAILS` are always admins. They are how the first person gets in, and the People page will not demote or remove them (it would only be undone at the next start). The app also refuses to demote or remove the last admin, or to let you change your own role.

When roles were added, every existing account became an admin. If you are upgrading an older install, that is who your admins are.

## The first admin

Nobody can sign in without an account, so the first admin comes from the environment: list your own email in `ADMIN_EMAILS`. The account is created at startup, and you sign in with a provider whose **verified** address is that email. Everyone else is invited from the People page.

For trying it on your own machine there is a shortcut: set `ADMIN_PASSWORD` and sign in with it (or run it with no sign-in provider at all). Treat the shared password as temporary: it is not tied to a person.

## Inviting someone

1. People, then **Invite someone**. Enter their email and choose a role.
2. They get an email (if email is set up) with a link. You also get the link to copy, for example to paste into a chat.
3. They open it and choose a sign-in option. When they sign in with an account that **uses the invited address**, their account is created and they are in.

The link works once and expires after 7 days. It is tied to the invited email address, not just to whoever holds the link, so a forwarded link is useless to anyone signed in with a different address. **Resend** replaces the pending invitation with a fresh link and expiry; **Cancel** stops it working.

Without an invitation, nobody can sign in: a provider login for an address with no account is refused, however valid the provider login is.

## Sign-in options

Each is switched on by its environment variables. Several can be on at once, and the sign-in page shows the ones that are set. You create the OAuth app or registration yourself at the provider, because only you can say which callback address and which people it is for. A provider's address only counts if the provider says it is **verified**.

### Microsoft 365

Sign-in is for **one tenant only** (yours). This matters: addresses in a Microsoft token are only safe to trust when the directory is yours to administer, so the app checks the token's tenant, app, nonce and expiry and never accepts a personal or other-organisation account.

1. In the Microsoft Entra admin center, open App registrations and create a new registration. Supported account types: **this organisation only**.
2. Add a Web redirect URI: `https://<admin host>/api/auth/microsoft/callback`.
3. Under Certificates & secrets, create a client secret (note when it expires, and put a reminder in your calendar).
4. Set `MICROSOFT_TENANT_ID` (Directory/tenant ID), `MICROSOFT_CLIENT_ID` (Application/client ID) and `MICROSOFT_CLIENT_SECRET`, then restart the app.

The ID token is received directly from Microsoft over TLS in exchange for the client secret, so its signature is not re-verified (permitted by OpenID Connect for this flow).

### Google

1. In the Google Cloud console, create an OAuth client ID of type Web application, with the authorised redirect URI `https://<admin host>/api/auth/google/callback`. Configure the OAuth consent screen (Internal if your Google account is a Workspace organisation, otherwise External).
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart the app.

### GitHub

Create an OAuth App at github.com/settings/developers with callback URL `https://<admin host>/api/auth/github/callback`, then set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` and restart the app. GitHub allows one callback URL per app. The GitHub username is stored on the account when someone signs in.

## Invitation email (Microsoft Graph)

Invitations are emailed through the Microsoft Graph API **from one mailbox**, using the same app registration as Microsoft sign-in. No mailbox password is stored. Without this, invitations still work: you copy the link and send it yourself. Email is only built in for Microsoft 365 (Graph); for any other mail provider, send the link yourself.

1. Pick or create the mailbox that will send them, for example `go@example.com`. A shared mailbox works.
2. On the same app registration, open API permissions, add **Microsoft Graph, Application permissions, `Mail.Send`**, and grant admin consent. A tenant admin has to do this.
3. **Limit the app to that one mailbox.** Without this, the permission lets the app send as *anyone* in the tenant. Microsoft's current guidance is not entirely clear-cut: the Graph permissions reference points to an *application access policy*, while Microsoft's newer *RBAC for Applications* is documented for Exchange and some reports say it does not restrict Graph calls on its own. The approach most practitioners report working is an application access policy: put only the sending mailbox in a mail-enabled security group, run `New-ApplicationAccessPolicy -AppId <client id> -PolicyScopeGroupId <group> -AccessRight RestrictAccess -Description "opengolinks"`, and confirm with `Test-ApplicationAccessPolicy`. Test it with a second mailbox before relying on it. Note it limits *which mailbox* the app can send as, not who it can send to.
4. Set `MAIL_FROM` to that mailbox's address, then restart the app. The Settings page shows "Invitation email: on" and the address it sends from.

Emails come from your tenant, so they carry your domain's own SPF and DKIM. If one lands in spam, ask the recipient to mark it as not spam; the invitation link is also on screen for you to send by hand.

## Retiring the shared password

The shared password is not tied to a person, so its actions are anonymous, and it counts as an admin. It works only while `ADMIN_PASSWORD` is set. When everyone has signed in with their own account:

1. Check People: each person shows a last sign-in date. Settings shows whether the shared password is still on.
2. Remove `ADMIN_PASSWORD` from the environment variables and restart the app. The password form disappears from the sign-in page, and any browser still signed in with it is signed out.

Make sure that at least one `ADMIN_EMAILS` person can sign in with a provider first, or you will be locked out (in production the app refuses to start with neither a provider nor a password). If you are ever locked out, put `ADMIN_PASSWORD` back, restart, and fix the provider.

## Security notes

- Invitation tokens are random and stored only as hashes. Accepting one is a single database delete, so two attempts at the same moment cannot both succeed. The invitation page sends no referrer and is never cached.
- Sign-in uses state, PKCE (Google, Microsoft) and a nonce (Microsoft), kept in short-lived httpOnly cookies. A `next` page to return to is accepted only inside `/admin`.
- Removing a person, or changing their role, applies on their very next request, and removing them also ends their connected apps.
- Inviting is limited to 30 invitations an hour per admin.
- The app accepts only providers' *verified* email addresses. A GitHub or Google address that is not verified, or a Microsoft token from another tenant, is refused.

## Where the code is

- `src/lib/users.ts`: accounts and roles, with the last-admin and `ADMIN_EMAILS` protections.
- `src/lib/invitations.ts`: invitations. `src/lib/signin.ts`: the common last step of every provider.
- `src/lib/signin-flow.ts` and `src/app/api/auth/*`: the three providers. `src/lib/providers.ts` says which are on.
- `src/lib/mailer.ts`: Microsoft Graph email. `src/lib/email-core.ts`, `src/lib/jwt-core.ts`: pure helpers with tests in `tests/`.
- `src/app/admin/(protected)/users/page.tsx`, `src/app/admin/users-actions.ts`, `src/components/InviteForm.tsx`: the People page.
- `src/app/admin/(protected)/settings/page.tsx`: Settings, which reports how sign-in and email are set up.
- `src/app/admin/invite/[token]/page.tsx`: where an invitation link lands.
