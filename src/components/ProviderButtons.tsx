import { providerLabel, type ProviderId } from "@/lib/providers";

/** "Continue with ..." for each configured provider. Plain links: the sign-in start is a route handler, so it must be a full navigation. */
export function ProviderButtons({ providers, next, invite }: { providers: ProviderId[]; next?: string | null; invite?: string }) {
  return (
    <div className="mt-6 space-y-2.5">
      {providers.map((p, i) => {
        const query = new URLSearchParams();
        if (next) query.set("next", next);
        if (invite) query.set("invite", invite);
        const qs = query.toString();
        return (
          <a
            key={p}
            href={`/api/auth/${p}${qs ? `?${qs}` : ""}`}
            className={`block rounded-lg px-4 py-2.5 text-center text-sm font-bold transition-colors ${
              i === 0 ? "bg-ink text-white hover:bg-accent" : "border border-line bg-white text-ink hover:border-accent hover:text-accent-deep"
            }`}
          >
            Continue with {providerLabel[p]}
          </a>
        );
      })}
    </div>
  );
}
