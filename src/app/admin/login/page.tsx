import { APP_NAME } from "@/lib/brand";
import { notFound } from "next/navigation";
import { currentHost, isAdminHost } from "@/lib/host";
import { ActionForm, SubmitButton } from "@/components/forms";
import { inputClass, labelClass } from "@/components/styles";
import { safeNext } from "@/lib/nav";
import { configuredProviders, passwordLoginEnabled } from "@/lib/providers";
import { ProviderButtons } from "@/components/ProviderButtons";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (!isAdminHost(await currentHost())) notFound();
  const { error, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  const providers = configuredProviders();
  const password = passwordLoginEnabled();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-12">
      <div className="rise card w-full max-w-sm p-7 sm:p-8">
        <p className="mb-7 text-xl font-bold tracking-tight">{APP_NAME}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-mute">Short links, QR codes and galleries.</p>
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-tint px-3 py-2 text-sm font-medium text-danger-ink">
            {error}
          </p>
        )}
        {providers.length > 0 && <ProviderButtons providers={providers} next={next} />}
        {providers.length > 0 && password && <p className="mt-5 text-center text-xs text-mute">or use the shared password</p>}
        {password && (
          <ActionForm action={loginAction} className="mt-6 space-y-4">
            {next && <input type="hidden" name="next" value={next} />}
            <div>
              <label htmlFor="password" className={labelClass}>Password</label>
              <input id="password" name="password" type="password" autoFocus={providers.length === 0} required className={inputClass} />
            </div>
            <SubmitButton>Sign in</SubmitButton>
          </ActionForm>
        )}
        {providers.length === 0 && !password && (
          <p role="alert" className="mt-6 text-sm text-danger-ink">
            No sign-in method is set up. Set the GitHub, Microsoft or Google variables (or ADMIN_PASSWORD) in the environment and redeploy.
          </p>
        )}
      </div>
    </main>
  );
}
