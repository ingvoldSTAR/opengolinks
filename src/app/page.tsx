import { notFound, redirect } from "next/navigation";
import { currentHost, isAdminHost } from "@/lib/host";
import { findDomain } from "@/lib/links";

export const dynamic = "force-dynamic";

export default async function Home() {
  const host = await currentHost();
  const domain = await findDomain(host);
  if (domain?.root_redirect_url) redirect(domain.root_redirect_url);
  if (isAdminHost(host)) redirect("/admin");
  notFound();
}
