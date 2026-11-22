import Link from "next/link";
import { currentRole } from "./auth";

/** For pages only admins may see: null when allowed, otherwise a friendly "admins only" page to return. */
export async function adminsOnly(): Promise<React.ReactElement | null> {
  if ((await currentRole()) === "admin") return null;
  return (
    <div className="max-w-xl space-y-3">
      <h1 className="text-4xl font-extrabold tracking-tight">Admins only</h1>
      <p className="text-sm text-mute">This page is for admins. Ask an admin if you need a change here, such as a new domain.</p>
      <Link href="/admin" className="inline-block text-sm font-semibold text-accent-deep hover:underline">&larr; Back to links</Link>
    </div>
  );
}
