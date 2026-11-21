"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { CloseIcon } from "./Icons";

const DrawerContext = createContext<{ close: () => void } | null>(null);

/** Lets a form inside a drawer close it once it has saved. */
export function useDrawer() {
  return useContext(DrawerContext);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Keep the content in the page while closed, so a form inside it still submits its fields. */
  keepMounted?: boolean;
};

/** A panel that slides in from the right over a dimmed page. Esc, the scrim and the close button all dismiss it. */
export function Drawer({ open, onClose, title, description, icon, children, footer, keepMounted = false }: DrawerProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>("input,select,textarea");
    const t = setTimeout(() => (first ?? panel.current)?.focus({ preventScroll: true }), 60);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      returnTo.current?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open && !keepMounted) return null;

  return (
    <div className={open ? "" : "pointer-events-none"} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-[0_10px_25px_-5px_rgba(34,12,16,0.18),0_8px_10px_-6px_rgba(34,12,16,0.1)] outline-none transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-5 sm:px-7">
          {icon && <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-white">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xl font-extrabold tracking-tight">{title}</h2>
            {description && <div className="mt-1 text-sm text-mute">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-ink/70 transition-colors hover:bg-ground hover:text-ink"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">{children}</div>
        {footer && <footer className="flex items-center justify-between gap-3 border-t border-line bg-white px-5 py-4 sm:px-7">{footer}</footer>}
      </div>
    </div>
  );
}

/** A button that opens a drawer holding its children, typically a form. */
export function DrawerButton({
  label,
  title,
  description,
  icon,
  children,
  variant = "primary",
}: {
  label: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  variant?: "primary" | "quiet";
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const styles =
    variant === "primary"
      ? "border border-transparent bg-accent font-bold text-white hover:bg-accent-deep"
      : "border border-line bg-white font-semibold text-ink hover:border-ink/40";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`rounded-lg px-5 py-2.5 text-sm transition-colors ${styles}`}>
        {label}
      </button>
      <Drawer open={open} onClose={close} title={title} description={description} icon={icon}>
        <DrawerContext.Provider value={{ close }}>{children}</DrawerContext.Provider>
      </Drawer>
    </>
  );
}
