import { CopyButton } from "@/components/CopyButton";
import { ActionForm, ConfirmButton, SubmitButton, inputClass, labelClass } from "@/components/forms";
import { cnameTarget, checkDomain, type DomainStatus } from "@/lib/domainStatus";
import { currentHost } from "@/lib/host";
import { listDomains } from "@/lib/links";
import { apexUrl } from "@/lib/validate";
import { addDomainAction, deleteDomainAction, updateDomainAction } from "../../actions";

const hint = "mt-1 text-xs text-licorice/60";

function Record({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-licorice/5 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-licorice/60">{label}</div>
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
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${live ? "bg-cobalt/10 text-cobalt" : "bg-ember/10 text-ember"}`}
    >
      {live ? "Live" : status === "dns-missing" ? "DNS not set up" : "Almost there"}
    </span>
  );
}

export default async function DomainsPage() {
  const [domains, host] = await Promise.all([listDomains(), currentHost()]);
  const target = cnameTarget(host);
  const statuses = await Promise.all(domains.map((d) => checkDomain(d.host)));
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Domains</h1>
        <p className="mt-1 text-sm text-licorice/70">
          Every short link lives on a domain, such as <span className="font-medium">go.example.com/sales</span>. Links and QR
          codes use the domain they were created on.
        </p>
      </div>

      <section className="rounded-lg border border-licorice/10 bg-white p-5">
        <h2 className="text-sm font-semibold">Add a domain</h2>
        <p className="mt-2 text-sm text-licorice/80">
          Type the domain below and press Add. Its card then shows the DNS record to create and tells you when the domain is live.
          Use a subdomain such as <span className="font-medium">go.example.com</span>.
        </p>
        <ActionForm action={addDomainAction} className="mt-4">
          <div className="flex gap-2">
            <input name="host" required placeholder="go.example.com" aria-label="Domain" className={inputClass} />
            <SubmitButton>Add</SubmitButton>
          </div>
          <p className={hint}>Just the domain, without https:// or a path.</p>
        </ActionForm>
      </section>

      <section className="space-y-4">
        {domains.map((d, i) => {
          const status = statuses[i];
          const name = d.host.split(".").length > 2 ? d.host.split(".")[0] : "@";
          return (
          <div key={d.id} className="rounded-lg border border-licorice/10 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">{d.host}</h3>
                <StatusPill status={status} />
                {d.host === host && (
                  <span className="rounded-full bg-cobalt/10 px-2 py-0.5 text-xs font-medium text-cobalt">
                    You are here
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-licorice/60">
                <span>
                  {d.link_count} {d.link_count === 1 ? "link" : "links"}
                  {d.gallery_count > 0 && `, ${d.gallery_count} ${d.gallery_count === 1 ? "gallery" : "galleries"}`}
                </span>
                <a href={`https://${d.host}/`} target="_blank" rel="noreferrer" className="hover:text-cobalt hover:underline">
                  Open site
                </a>
              </div>
            </div>

            {(status === "dns-missing" || status === "needs-connect") && (
              <div className="mt-4 rounded-md border border-ember/30 p-4">
                <h4 className="text-sm font-semibold">Finish setting up {d.host}</h4>
                <ol className="mt-2 list-decimal space-y-3 pl-5 text-sm text-licorice/80">
                  <li className={status === "needs-connect" ? "text-licorice/50 line-through" : ""}>
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
                        Some providers want the full name, {d.host}, instead of {name}. DNS changes can take a while to spread.
                        Some hosts replace this record with their own alias once the domain is attached. That is expected.
                      </p>
                    )}
                  </li>
                  <li>
                    At your hosting provider, attach <span className="font-medium">{d.host}</span> to this app so that requests
                    for it reach the app and it has a certificate. The steps depend on the host (often called an alias, custom
                    domain or parked domain). Reload this page to check.
                  </li>
                </ol>
                <p className={hint}>
                  Done something? <a href="/admin/domains" className="text-cobalt hover:underline">Check again</a>
                </p>
              </div>
            )}

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

            <div className="mt-4 border-t border-licorice/10 pt-4">
              {d.link_count > 0 || d.gallery_count > 0 ? (
                <p className="text-xs text-licorice/60">
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
          <p className="rounded-lg border border-dashed border-licorice/20 p-6 text-center text-sm text-licorice/60">
            No domains yet. Add your first one above, then create links on it.
          </p>
        )}
      </section>
    </div>
  );
}
