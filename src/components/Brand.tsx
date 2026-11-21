import Link from "next/link";

/** The product name as plain text, for the top of the side rail and the phone header. */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link href="/admin" aria-label="opengolinks, home" className={`block text-xl font-bold tracking-tight text-white ${className}`}>
      opengolinks
    </Link>
  );
}
