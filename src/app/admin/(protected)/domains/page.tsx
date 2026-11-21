import { Suspense } from "react";
import { after } from "next/server";
import { DrawerButton } from "@/components/Drawer";
import { GlobeIcon } from "@/components/Icons";
import { DomainKey } from "@/components/DomainTag";
import { CopyButton } from "@/components/CopyButton";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { inputClass, labelClass } from "@/components/styles";
import { cnameTarget, checkDomain, type DomainStatus } from "@/lib/domainStatus";
import { currentHost } from "@/lib/host";
import { backfillIcons } from "@/lib/favicon";
import { listDomains, markDomainLive } from "@/lib/links";
import { apexUrl } from "@/lib/validate";
import { addDomainAction, deleteDomainAction, refreshFaviconAction, updateDomainAction } from "../../actions";

const hint = "mt-1 text-xs text-mute";

function Record({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-ground px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-mute">{label}</div>
        <div className="truncate font-mono text-sm">{value}</div>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

function StatusPill({ status }: { status: DomainStatus }) {
  if (status === "unchecked") return null;
  const live = status === "live";
  return (
    <span
      className={`tag gap-1.5 ${live ? "bg-ok/10 text-ok" : "bg-danger-tint text-danger-ink"}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${live ? "bg-ok" : "bg-danger-ink"}`} />
      {live ? "Live" : status === "dns-missing" ? "DNS not set up" : "Almost there"}
    </span>
  );
}

async function StatusBlock({ id, host, name, target, pending }: { id: number; host: string; name: string; target: string; pending: boolean }) {
  const status = await checkDomain(host);
  // Once a domain answers, it stops being pinned to the top of the list.
  if (pending && (status === "live" || status === "unchecked")) {
    after(() => markDomainLive(id).catch((e) => console.error("[domains]", host, e instanceof Error ? e.message : e)));
  }
  return (
    <>
      {status !== "unchecked" && (
        <div className="mt-3">
          <StatusPill status={status} />
        </div>
      )}
        {(status === "dns-missing" || status === "needs-connect") && (
          <div className="mt-4 rounded-md border border-danger/30 p-4">
            <h4 className="text-sm font-semibold">Finish setting up {host}</h4>
            <ol className="mt-2 list-decimal space-y-3 pl-5 text-sm text-ink/80">
              <li className={status === "needs-connect" ? "text-mute line-through" : ""}>
                <span>At the DNS provider for this domain, create this record.</span>
                {status === "dns-missing" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Record label="Type" value="CNAME" />
                    <Record label="Name" value={name} />
                    <Record label="Value" value={target} />
                  </div>
                )}
                {status === "dns-missing" && (
                  <p className={hint}>
                    Some providers want the full name, {host}, instead of {name}. DNS changes can take a while to spread.
                    Some hosts replace this record with their own alias once the domain is attached. That is expected.
                  </p>
                )}
              </li>
              <li>
                At your hosting provider, attach <span className="font-medium">{host}</span> to this app so that requests for it
                reach the app and it has a certificate. The steps depend on the host (often called an alias, custom domain or
                parked domain). Reload this page to check.
              </li>
            </ol>
            <p className={hint}>
              Done something? <a href="/admin/domains" className="text-accent-deep hover:underline">Check again</a>
            </p>
          </div>
        )}
    </>
  );
}

export default async function DomainsPage() {
  const [domains, host] = await Promise.all([listDomains(), currentHost()]);
  backfillIcons(domains);
  const target = cnameTarget(host);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
       <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Domains</h1>
        <p className="mt-1 text-sm text-mute">
          Every short link lives on a domain, such as <span className="font-medium">go.example.com/sales</span>. Links and QR
          codes use the domain they were created on.
        </p>
       </div>
        <DrawerButton
          label="Add domain"
          title="Add a domain"
          icon={<GlobeIcon />}
          description="Every short link lives on a domain. Add it here, then finish the DNS and hosting steps shown on its card."
        >
          <ActionForm action={addDomainAction} className="space-y-5">
            <div>
              <label htmlFor="new-host" className={labelClass}>Domain</label>
              <input id="new-host" name="host" required placeholder="go.example.com" autoComplete="off" className={inputClass} data-autofocus />
              <p className={hint}>Just the domain, without https:// or a path. Use a subdomain such as go.example.com.</p>
            </div>
            <ul className="space-y-2 rounded-xl bg-ground p-4 text-sm text-ink/80">
              <li>Its card then shows the DNS record to create and tells you when the domain is live.</li>
              <li>The brand icon is fetched from the main website, for example example.com.</li>
              <li>Visitors with no valid short link go to the main website until you change it.</li>
            </ul>
            <SubmitButton>Add domain</SubmitButton>
          </ActionForm>
        </DrawerButton>
      </div>

      <section className="space-y-4">
        {domains.map((d) => {
          const name = d.host.split(".").length > 2 ? d.host.split(".")[0] : "@";
          return (
          <div key={d.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h3 className="flex items-center gap-3 text-lg font-extrabold"><DomainKey host={d.host} id={d.id} hasIcon={d.has_icon} size={32} />{d.host}</h3>
                {d.host === host && (
                  <span className="tag bg-accent-tint text-accent-ink">
                    You are here
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-mute">
                <span>
                  {d.link_count} {d.link_count === 1 ? "link" : "links"}
                  {d.gallery_count > 0 && `, ${d.gallery_count} ${d.gallery_count === 1 ? "gallery" : "galleries"}`}
                </span>
                <a href={`https://${d.host}/`} target="_blank" rel="noreferrer" className="hover:text-accent-deep hover:underline">
                  Open site
                </a>
                <ActionForm action={refreshFaviconAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="font-semibold text-ink/70 underline-offset-4 hover:text-accent-deep hover:underline">
                    {d.has_icon ? "Refresh icon" : "Fetch icon"}
                  </button>
                </ActionForm>
              </div>
            </div>

            <Suspense fallback={<p className="mt-3 flex items-center gap-2 text-sm text-mute"><span className="size-2 animate-pulse rounded-full bg-mute" />Checking DNS...</p>}>
              <StatusBlock id={d.id} host={d.host} name={name} target={target} pending={!d.went_live_at} />
            </Suspense>

            <ActionForm action={updateDomainAction} className="mt-4">
              <input type="hidden" name="id" value={d.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor={`root-${d.id}`}>
                    When someone opens {d.host}
                  </label>
                  <input
                    id={`root-${d.id}`}
                    name="root_redirect_url"
                    defaultValue={d.root_redirect_url ?? ""}
                    placeholder={apexUrl(d.host) ?? "https://example.com"}
                    className={inputClass}
                  />
                  <p className={hint}>Send them to this page. Leave blank to show a 404.</p>
                </div>
                <div>
                  <label className={labelClass} htmlFor={`nf-${d.id}`}>
                    When a short link does not exist
                  </label>
                  <input
                    id={`nf-${d.id}`}
                    name="not_found_url"
                    defaultValue={d.not_found_url ?? ""}
                    placeholder={apexUrl(d.host) ?? "https://example.com"}
                    className={inputClass}
                  />
                  <p className={hint}>Send them to this page instead. Leave blank to show a 404.</p>
                </div>
              </div>
              <div className="mt-4">
                <SubmitButton variant="quiet">Save</SubmitButton>
              </div>
            </ActionForm>

            <div className="mt-4 border-t border-line pt-4">
              {d.link_count > 0 || d.gallery_count > 0 ? (
                <p className="text-xs text-mute">
                  To remove this domain, first delete its{" "}
                  {[
                    d.link_count > 0 && (d.link_count === 1 ? "link" : `${d.link_count} links`),
                    d.gallery_count > 0 && (d.gallery_count === 1 ? "gallery" : `${d.gallery_count} galleries`),
                  ]
                    .filter(Boolean)
                    .join(" and ")}
                  .
                </p>
              ) : (
                <ActionForm action={deleteDomainAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <ConfirmButton message={`Remove ${d.host}? Short links on it will stop working.`}>Remove domain</ConfirmButton>
                </ActionForm>
              )}
            </div>
          </div>
          );
        })}
        {domains.length === 0 && (
          <p className="rounded-lg border border-dashed border-ink/20 p-6 text-center text-sm text-mute">
            No domains yet. Add your first one above, then create links on it.
          </p>
        )}
      </section>
    </div>
  );
}
