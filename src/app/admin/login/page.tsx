import { notFound } from "next/navigation";
import { currentHost, isAdminHost } from "@/lib/host";
import { ActionForm, SubmitButton, inputClass, labelClass } from "@/components/forms";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isAdminHost(await currentHost())) notFound();
  const { error } = await searchParams;
  const github = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  return (
    <main className="mx-auto mt-32 max-w-sm px-4">
      <h1 className="text-xl font-semibold">Go links</h1>
      {error && (
        <p role="alert" className="mt-4 text-sm text-ember">
          {error}
        </p>
      )}
      {github && (
        <>
          {/* A plain link: the OAuth start is a route handler, so it must be a full navigation. */}
          <a
            href="/api/auth/github"
            className="mt-6 block rounded-md bg-licorice px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            Continue with GitHub
          </a>
          <p className="mt-6 text-center text-xs text-licorice/60">or use the shared password</p>
        </>
      )}
      <ActionForm action={loginAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className={labelClass}>Password</label>
          <input id="password" name="password" type="password" autoFocus={!github} required className={inputClass} />
        </div>
        <SubmitButton>Sign in</SubmitButton>
      </ActionForm>
    </main>
  );
}
