import { APP_NAME } from "@/lib/brand";
import Link from "next/link";

/** The product name as plain text, for the top of the side rail and the phone header. */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link href="/admin" aria-label={`${APP_NAME}, home`} className={`block text-xl font-bold tracking-tight text-white ${className}`}>
      {APP_NAME}
    </Link>
  );
}
