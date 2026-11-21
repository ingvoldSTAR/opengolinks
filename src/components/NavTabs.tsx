"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobeIcon, GridIcon, LinkIcon, MegaphoneIcon, UploadIcon } from "./Icons";

const ITEMS = [
  { href: "/admin", label: "Links", Icon: LinkIcon, match: (p: string) => p === "/admin" || p.startsWith("/admin/links") },
  { href: "/admin/campaigns", label: "Campaigns", Icon: MegaphoneIcon, match: (p: string) => p.startsWith("/admin/campaigns") },
  { href: "/admin/galleries", label: "Galleries", Icon: GridIcon, match: (p: string) => p.startsWith("/admin/galleries") },
  { href: "/admin/domains", label: "Domains", Icon: GlobeIcon, match: (p: string) => p.startsWith("/admin/domains") },
  { href: "/admin/import", label: "Import", Icon: UploadIcon, match: (p: string) => p.startsWith("/admin/import") },
];

/** The main navigation, as a vertical list for the side rail and the phone menu. */
export function NavTabs({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, Icon, match }) => {
        const active = match(path);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors ${
              active
                ? "bg-white/15 font-bold text-white"
                : "font-semibold text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
