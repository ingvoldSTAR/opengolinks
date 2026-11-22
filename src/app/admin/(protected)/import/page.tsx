import { adminsOnly } from "@/lib/gate";
import Link from "next/link";
import { CsvImportForm } from "@/components/CsvImportForm";
import { ImportForm } from "@/components/ImportForm";
import { listDomains } from "@/lib/links";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const denied = await adminsOnly();
  if (denied) return denied;
  const domains = await listDomains();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Import links</h1>
        <p className="mt-1 text-sm text-mute">
          Bring links in from Rebrandly or from a CSV file. Both keep each link&apos;s domain and slug, so printed QR codes and shared
          links keep working once the domain&apos;s DNS points to this app. Run an import before you switch a domain&apos;s DNS.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-lg font-extrabold">Before you start</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink/80">
          <li>
            Add each domain you are moving on the <Link href="/admin/domains" className="text-accent-deep underline">Domains</Link> page.
            Links on domains that are not added here are not imported, and the report tells you which.
            {domains.length > 0 && (
              <span className="text-mute"> Added so far: {domains.map((d) => d.host).join(", ")}.</span>
            )}
          </li>
          <li>Run a preview first, check the report, then untick &ldquo;Preview only&rdquo; and import.</li>
        </ol>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-extrabold">From Rebrandly</h2>
        <p className="mt-2 text-sm text-ink/80">
          Get an API key from your Rebrandly account settings. A key covers one workspace, so repeat this for each workspace.
        </p>
        <ImportForm />
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-extrabold">From a CSV file</h2>
        <p className="mt-2 text-sm text-ink/80">
          The first row names the columns. Save the file as CSV in UTF-8; commas and semicolons both work.
        </p>
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm text-ink/80 sm:grid-cols-[max-content_1fr]">
          <dt className="font-mono text-xs leading-5">domain</dt>
          <dd>Required. A domain already added on the Domains page, such as go.example.com.</dd>
          <dt className="font-mono text-xs leading-5">slug</dt>
          <dd>Required. Letters, numbers, hyphens and underscores, up to 64 characters.</dd>
          <dt className="font-mono text-xs leading-5">destination</dt>
          <dd>Required. A full http:// or https:// address.</dd>
          <dt className="font-mono text-xs leading-5">title</dt>
          <dd>Optional.</dd>
          <dt className="font-mono text-xs leading-5">utm_source, utm_medium, utm_campaign, utm_term, utm_content</dt>
          <dd>Optional. Saved as the link&apos;s campaign fields, in lower case.</dd>
        </dl>
        <CsvImportForm />
      </section>

      <section className="card p-5 text-sm text-ink/80">
        <h2 className="text-lg font-extrabold">Good to know</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>It is safe to run again. Links that are already here are never changed or duplicated.</li>
          <li>A link that already exists with a different destination is listed and left as it is.</li>
          <li>Slugs are saved in lower case. Two entries that differ only by capital letters cannot both be kept.</li>
          <li>Slugs this app does not support (anything but letters, numbers, hyphens and underscores, or a reserved word) are listed as skipped, as are destinations that are not http or https and slugs a gallery already uses.</li>
          <li>Click history does not come across. Statistics here start from zero for imported links.</li>
          <li>From Rebrandly, the original creation date and title are kept. A note on each link records where it came from.</li>
        </ul>
      </section>
    </div>
  );
}
