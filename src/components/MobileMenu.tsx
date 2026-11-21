"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NavTabs } from "./NavTabs";
import { CloseIcon, MenuIcon } from "./Icons";

/** Phone navigation: a button that opens the same list as the side rail. */
export function MobileMenu({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="grid size-11 place-items-center rounded-lg text-white transition-colors hover:bg-white/10"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      {open && (
        <div id="mobile-menu" className="rail absolute inset-x-0 top-full z-40 border-t border-white/10 bg-ink px-4 pb-4 pt-3 shadow-xl">
          <NavTabs onNavigate={() => setOpen(false)} />
          {children}
        </div>
      )}
    </div>
  );
}
