import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24">
      <header className="flex items-center justify-between py-6">
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/admin" className="text-base font-semibold">opengolinks</Link>
          <Link href="/admin" className="hover:text-cobalt">Links</Link>
          <Link href="/admin/campaigns" className="hover:text-cobalt">Campaigns</Link>
          <Link href="/admin/galleries" className="hover:text-cobalt">Galleries</Link>
          <Link href="/admin/domains" className="hover:text-cobalt">Domains</Link>
          <Link href="/admin/import" className="hover:text-cobalt">Import</Link>
        </nav>
        <form action={logoutAction}>
          <button className="text-sm text-licorice/70 hover:text-licorice">Sign out</button>
        </form>
      </header>
      {children}
    </div>
  );
}
