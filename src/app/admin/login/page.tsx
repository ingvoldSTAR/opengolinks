import { notFound } from "next/navigation";
import { currentHost, isAdminHost } from "@/lib/host";
import { ActionForm, SubmitButton } from "@/components/forms";
import { inputClass, labelClass } from "@/components/styles";
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-12">
      <div className="rise card w-full max-w-sm p-7 sm:p-8">
        <p className="mb-7 text-xl font-bold tracking-tight">opengolinks</p>
        <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-mute">Short links, QR codes and galleries.</p>
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-tint px-3 py-2 text-sm font-medium text-danger-ink">
            {error}
          </p>
        )}
        {github && (
          <>
            {/* A plain link: the OAuth start is a route handler, so it must be a full navigation. */}
            <a
              href="/api/auth/github"
              className="mt-6 block rounded-lg bg-ink px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-accent"
            >
              Continue with GitHub
            </a>
            <p className="mt-5 text-center text-xs text-mute">or use the shared password</p>
          </>
        )}
        <ActionForm action={loginAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <input id="password" name="password" type="password" autoFocus={!github} required className={inputClass} />
          </div>
          <SubmitButton>Sign in</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
