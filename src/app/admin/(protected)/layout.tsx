import { requireAdmin, sessionIdentity } from "@/lib/auth";
import { Brand } from "@/components/Brand";
import { MobileMenu } from "@/components/MobileMenu";
import { NavTabs } from "@/components/NavTabs";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

function Account({ who }: { who: string | null }) {
  return (
    <div className="text-sm">
      {who && <div className="mb-2 truncate px-3 text-white/70">{who}</div>}
      <form action={logoutAction}>
        <button className="w-full rounded-lg px-3 py-2.5 text-left font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white">
          Sign out
        </button>
      </form>
    </div>
  );
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const who = await sessionIdentity();
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="rail fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink px-4 py-6 lg:flex">
        <Brand className="w-full" />
        <div className="mt-9">
          <NavTabs />
        </div>
        <div className="mt-auto border-t border-white/10 pt-4">
          <Account who={who} />
        </div>
      </aside>

      <header className="rail relative flex items-center justify-between bg-ink px-4 py-2 lg:hidden">
        <Brand />
        <MobileMenu>
          <div className="mt-3 border-t border-white/10 pt-3">
            <Account who={who} />
          </div>
        </MobileMenu>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">{children}</main>
    </div>
  );
}
