/** Shown the instant a menu item is clicked, while the next page loads from the server. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className="animate-pulse space-y-8">
      <div>
        <div className="h-10 w-48 rounded-lg bg-ink/10" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-ink/10" />
      </div>
      <div className="card h-48 bg-white" />
      <div className="card overflow-hidden bg-white">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-5 py-5 last:border-0">
            <div className="size-9 rounded-lg bg-ink/10" />
            <div className="h-4 w-56 max-w-[50%] rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
