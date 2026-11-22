# Deploying opengolinks

This page explains what the app needs from a host, and how to set it up on Vercel, Netlify, Cloudflare, Railway, Render, Fly.io, or a server you run yourself.

**How much to trust this page.** The app has been run locally and on a managed Node.js host with an external Postgres database. The platform sections below are written from each platform's own documentation and have **not** been deployed end to end by the author. Platforms change their dashboards, limits and prices, so treat the steps as a map and check the linked platform's current docs for exact screens and values. If something here is wrong, please open an issue.

## What the app needs from a host

Before choosing, check the host can do all of these. They are what makes this app different from a typical website.

1. **Run Next.js 16 on Node.js 22 or later.** Either a long-running server (`npm run build`, then `npm start`) or a platform that runs Next.js for you.
2. **Reach a Postgres database over TCP.** The app talks to Postgres with the `pg` driver. On serverless platforms, use your database's pooled connection string (set `DATABASE_URL_POOLED`) so many short-lived functions do not exhaust its connections.
3. **Pass the original `Host` header through, for any domain.** One app serves every short-link domain and decides what to do from the host name. The last `X-Forwarded-Host` entry wins when there is one.
4. **Give every domain a certificate.** Each short-link domain needs HTTPS. How you get it differs a lot between platforms, and it is usually the fiddly part.
5. **Allow outbound DNS lookups and HTTPS requests to public sites.** The Domains page checks each domain, the app fetches each domain's icon, and the Rebrandly importer calls Rebrandly. These use Node's `dns` and `https` modules, which some edge runtimes do not provide.
6. **Keep running a moment after the response is sent.** Click logging uses Next.js `after()` so the redirect is not delayed. On a long-running server this just works. On serverless platforms it depends on the platform keeping the function alive: after deploying, click a link and check the count rises.
7. **Start quickly.** Short links are followed by the public, and a slow cold start is a slow redirect. Avoid plans that put the app to sleep when idle.

## The same setup everywhere

Whatever the host, these steps are the same. They are also listed in [the README](../README.md#what-you-need-to-set-up).

1. **Create a Postgres database** and keep its connection string. Neon, Supabase, your host's own Postgres, or any other Postgres works. Tables are created on the first request.
2. **Set the environment variables.** At minimum:

   | Variable | What to put |
   | --- | --- |
   | `DATABASE_URL` | The Postgres connection string. |
   | `SESSION_SECRET` | A random string of at least 32 characters: `openssl rand -hex 32`. |
   | `ADMIN_HOSTS` | The host that serves `/admin`, for example `go.example.com`. |
   | `ADMIN_EMAILS` | Your own email. This is the first admin. |
   | A sign-in method | Variables for GitHub, Google or Microsoft 365 (see [auth.md](auth.md)), or `ADMIN_PASSWORD` for a quick start. |

   Optional: `TIMEZONE`, `APP_NAME`, `CNAME_TARGET`, and the invitation-email settings. The full list is in the README.
3. **Attach the admin domain to the host** and make sure it has HTTPS. That domain is the one in `ADMIN_HOSTS`.
4. **Create the sign-in app at your provider**, with the callback address `https://<admin host>/api/auth/<provider>/callback`.
5. **For each short-link domain**, do three things, once:
   1. Create a DNS record at the domain's DNS provider (usually a CNAME to your admin host, or to the target your host shows).
   2. Attach the domain to the app at the host, so requests for it reach the app and it gets a certificate.
   3. Add it on the app's **Domains** page. The page shows what is left to do and tells you when the domain is live.
6. **Sign in**, add a domain, create a link, and follow it.

The admin area answers only on the hosts in `ADMIN_HOSTS`. Every other domain answers redirects, and gets a 404 for `/admin`.

### Which database

| Where | Notes |
| --- | --- |
| Neon, Supabase and similar | Free tiers exist. Use the **pooled** string on serverless platforms. Check the provider's current limits and whether a free database pauses when idle: a paused database makes the first redirect slow. |
| The host's own Postgres (Railway, Render, Fly.io and others) | Simplest when the app and database are on the same platform. |
| Self-hosted | Fine. Back it up. |

`DATABASE_URL` is verified against the server's certificate. For a database with a self-signed certificate, add `sslmode=no-verify` to the string. Whatever you pick, **take backups**: your links and their QR codes live in that database.

## At a glance

| Platform | Fit | Notes |
| --- | --- | --- |
| [Vercel](#vercel) | Expected to work | Next.js's home. External Postgres. Country detection works. |
| [Netlify](#netlify) | Expected to work, check two things | Next.js support is automatic. Country shows as Unknown. |
| [Cloudflare Workers](#cloudflare) | **Not supported as it stands** | Uses Node features Workers lack. Cloudflare in front of another host works well. |
| [Railway](#railway) | Expected to work | A plain Node server. Postgres on the same platform. |
| [Render](#render) | Expected to work | Avoid plans that sleep. |
| [Fly.io](#flyio) | Expected to work | Certificates per domain with one command. |
| [A server of your own](#a-server-of-your-own-docker-vps) | Expected to work | You run the proxy. Caddy makes certificates easy. |
| [Managed Node.js hosting](#managed-nodejs-hosting-with-parked-domains) | Works | Attach each extra domain as an alias or parked domain. |

---

## Vercel

Status: expected to work. Next.js runs on Vercel natively.

1. **Import the repository** as a new project. Vercel detects Next.js. Make sure the project uses Node.js 22 or later (the repository declares `>=22`; check the Node.js version in the project settings).
2. **Add a database.** Either use a Postgres integration from the Vercel Marketplace, or paste a connection string from Neon or another provider. Use the **pooled** string.
3. **Set the environment variables** in the project settings (see [the same setup everywhere](#the-same-setup-everywhere)).
4. **Add the domains.** In the project, open Settings, then Domains, and add the admin host first. Vercel shows the DNS record to create for each domain. As Vercel describes it, an apex domain is pointed with an A record and a subdomain with a CNAME, and the CNAME target can be specific to your project, so copy the value Vercel shows rather than one from a guide. If an old host's A records are still on the domain, delete them first, because stale records stop Vercel from verifying the domain.
5. For each **short-link domain**, add it to the same Vercel project the same way, then add it on the app's Domains page. Set `CNAME_TARGET` to the target Vercel shows if you want the Domains page to display the right record.

Things to check:

- Whether your plan allows your number of domains and the kind of use you have in mind (Vercel's free plan has terms about commercial use).
- Click counts after deploying: `after()` relies on Vercel keeping the function alive, which it does for Next.js.
- Country statistics work out of the box: the app reads the `x-vercel-ip-country` header.

## Netlify

Status: expected to work, not tested. Netlify runs Next.js through its open-source adapter with no configuration.

1. **Create a site from the repository.** Netlify detects Next.js and provisions functions for server rendering, route handlers and Server Actions.
2. **Database:** use an external Postgres, with the pooled connection string.
3. **Set the environment variables** under the site's configuration.
4. **Domains:** add the admin domain as the site's custom domain, and each short-link domain as an additional domain on the same site (Netlify calls these domain aliases; check the current docs and your plan for limits). Create the DNS record Netlify tells you to, and add the domain on the app's Domains page.

Things to check:

- **Country shows as Unknown**, because the app does not read Netlify's location header. Everything else is unaffected.
- Click logging after the redirect depends on the function staying alive. Click a link after deploying and check the count rises.
- Function time limits and whether they affect the Rebrandly import for a large account.

## Cloudflare

**Workers (including Pages with the Next.js adapter): not supported as it stands.** Cloudflare can run Next.js on Workers through the OpenNext adapter, in a Node.js-compatibility mode. But this app relies on parts that Workers do not provide or provide differently:

- `node:dns` lookups and `node:https` requests with the connection pinned to an address checked beforehand. The domain checks, the icon fetch and the Rebrandly importer use them, as protection against being tricked into contacting internal addresses.
- A Postgres driver over raw TCP. Workers can open TCP connections and Cloudflare has a connection service for Postgres (Hyperdrive), but the app has not been written or tested for it.
- The size of the deployed bundle, which Workers limit.

Expect the Domains page and the importer to fail at least. Cloudflare's own recommended route for Next.js on Workers has also been changing, so check their documentation if you want to try, and treat anything you get working as your own port.

**Cloudflare in front of another host: works well.** Use Cloudflare for DNS, and optionally as the proxy (the orange cloud), with the app running on Railway, Render, Fly.io, a server of yours, or anywhere else above.

- **DNS only (grey cloud)** is the simplest: Cloudflare just answers DNS, and traffic goes straight to the host.
- **Proxied (orange cloud)** adds Cloudflare's CDN and protection. Set SSL/TLS mode to **Full (strict)**, so Cloudflare checks the host's certificate, and make sure the host has a certificate for each domain. Cloudflare sends the visitor's country in the `cf-ipcountry` header, which the app reads, so country statistics work.
- A domain at the top of its zone cannot normally use a CNAME, but Cloudflare flattens a CNAME at the apex, so it works there.
- Cloudflare also has a product for serving many customer domains through one hostname (Cloudflare for SaaS). It is a different way to do step 5 of the setup, with its own pricing; this app does not need it.

## Railway

Status: expected to work. Railway runs a plain Node server, which is what the app is.

1. **New project, deploy from your GitHub repository.** Railway detects Node and runs `npm run build` and `npm start`. It provides the port in `PORT`, which `next start` reads.
2. **Add a PostgreSQL database** to the project. In the app service's variables, set `DATABASE_URL` to reference the database service's connection variable (Railway lets one service reference another's variables; see their documentation for the syntax).
3. **Set the other environment variables** (see [the same setup everywhere](#the-same-setup-everywhere)).
4. **Domains:** in the service's settings, open Networking, then Custom Domain, and add the admin domain, then each short-link domain. Railway shows a **CNAME** to create, and a **TXT record** (`_railway-verify`) that proves you own the domain. **Both are needed**: with only the CNAME, requests to the domain can return a 404. Verification can take a while after the records are correct.
5. Add each domain on the app's Domains page.

Check your plan's current limits on usage and on the number of custom domains.

## Render

Status: expected to work, not tested.

1. **New Web Service from your repository.** Build command `npm ci && npm run build`, start command `npm start`. Render sets `PORT`.
2. **Database:** Render's Postgres, or an external one. Use the connection address for the same region where you can.
3. **Environment variables:** as in [the same setup everywhere](#the-same-setup-everywhere).
4. **Domains:** add each domain in the service's settings, create the DNS record Render shows, and Render issues the certificate. Then add the domain on the app's Domains page.

Check whether your plan puts the service to sleep when idle. On such plans the first visitor after a quiet period waits for the app to start, which is poor for a link shortener. Use an always-on plan for real traffic.

## Fly.io

Status: expected to work, not tested.

1. **`fly launch`** in the repository detects Next.js and can generate a Dockerfile. Set secrets with `fly secrets set DATABASE_URL=... SESSION_SECRET=...` and the other variables, then `fly deploy`.
2. **Database:** an external Postgres is the simplest. Fly also has its own Postgres offerings; see their docs for the current options.
3. **Domains:** for each domain run `fly certs add <domain>`, then create the DNS records Fly prints. Add the domain on the app's Domains page.

Check that at least one machine stays running if you use automatic stopping, so the first visit is not slow.

## A server of your own (Docker, VPS)

Status: expected to work. This is the most flexible option, and the one where you do the most.

Run the app:

```bash
npm ci
npm run build
PORT=3000 npm start
```

Keep it running with systemd, pm2, or a container based on a Node 22 image, and put a reverse proxy in front for HTTPS. It must pass the `Host` header and set `X-Forwarded-For`.

**Caddy** is the easiest, because it gets certificates by itself for the names you list:

```
go.example.com, go.example.org {
    reverse_proxy localhost:3000
}
```

Adding a domain means adding its name to this file and reloading Caddy. Caddy can also issue certificates for names it has not been told about ("on-demand TLS"), but it should then be given an address to ask whether a name is allowed, to stop strangers using your server to obtain certificates. This app does not provide such an address, so list the domains explicitly.

**nginx** works too: `proxy_pass http://127.0.0.1:3000;` with `proxy_set_header Host $host;` and `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, and a certificate for each name (Certbot can do this).

You also look after the operating system, updates, the database and its backups, and monitoring.

## Managed Node.js hosting with parked domains

Status: works. Some hosts offer a managed Node.js app together with "alias" or "parked" domains: you attach extra domains to the app, and the host serves the app for them and issues their certificates. This suits the app well. Per domain:

1. Create a DNS record pointing the domain at the host (a CNAME to your admin host, or what the host tells you).
2. Attach the domain to the app as an alias or parked domain.
3. Add it on the Domains page.

Make sure the host's Node.js is version 22 or later and that the app is built with `npm run build` and started with `npm start`.

---

## After deploying: a short checklist

1. Open `https://<admin host>/admin/login`. You should see your sign-in buttons. If you see "No sign-in method is set up", re-check the variables.
2. Sign in with the account listed in `ADMIN_EMAILS`. You should land in the admin as an **Admin**.
3. Open **Settings**. Sign-in options and email should show as you expect, and it flags a mistyped Microsoft setting.
4. Add a short-link domain on **Domains**, finish its steps, and wait for **Live**. If the page says it cannot confirm a domain, its card checks again from your browser, which is the more reliable test.
5. Create a link, follow it in a private window, and check the click count.
6. Invite a teammate from **People**, then retire `ADMIN_PASSWORD` if you used it.
7. Optional: connect an AI agent from **Connected apps** (see [mcp.md](mcp.md)).

## Troubleshooting

- **`/admin` answers 404.** `ADMIN_HOSTS` does not include the host you opened, or is empty in production.
- **The server will not start in production.** It prints what is wrong: usually a missing or short `SESSION_SECRET`, or no sign-in method at all.
- **Sign-in with a provider fails.** The callback address at the provider must match exactly (`https://<admin host>/api/auth/<provider>/callback`), and the email the provider reports must be **verified** and match an account or an invitation.
- **A domain shows "Not confirmed" but works in a browser.** The server cannot always reach its own public addresses. The card asks the browser too, and shows Live when the browser can reach it.
- **Clicks are not counted on a serverless platform.** The work after the redirect may be cut short there. Check the platform's support for `after()` (Next.js's way of running work after the response).
- **The first redirect after a quiet period is slow.** The app or the database was asleep. Use an always-on plan, or a database that does not pause.
