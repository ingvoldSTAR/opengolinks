"use client";

import { createContext, useActionState, useContext, useEffect, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useDrawer } from "./Drawer";

export type FormState = { error?: string; ok?: string; details?: string[] } | undefined;
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const PendingContext = createContext(false);

export function ActionForm({
  action,
  children,
  className,
  onOk,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  /** Called after each successful submit, for example to clear a form that adds items one by one. */
  onOk?: () => void;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [pending, startTransition] = useTransition();
  const drawer = useDrawer();
  useEffect(() => {
    if (state?.ok) {
      onOk?.();
      drawer?.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  // Submitting through onSubmit (not the action prop) stops React 19 from clearing
  // the fields after the action returns, so a validation error keeps what was typed.
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {state?.error && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger-ink">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="mt-3 text-sm font-medium text-ok">
          {state.ok}
        </p>
      )}
      {state?.details && state.details.length > 0 && (
        <ul className="mt-3 max-h-72 list-disc space-y-1 overflow-auto rounded-lg bg-ground py-3 pl-8 pr-4 text-sm text-ink/80">
          {state.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "quiet";
}) {
  const formStatus = useFormStatus();
  const pending = useContext(PendingContext) || formStatus.pending;
  const styles =
    variant === "primary"
      ? "border border-transparent bg-accent font-bold text-white hover:bg-accent-deep hover:outline hover:outline-2 hover:outline-offset-2 hover:outline-accent"
      : "border border-line bg-white font-semibold text-ink hover:border-ink/40";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-50 ${styles}`}
    >
      {pending ? "Working..." : children}
    </button>
  );
}

export function ConfirmButton({ message, children }: { message: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className="rounded-lg border border-danger-ink/40 px-3 py-2 text-sm font-semibold text-danger-ink transition-colors hover:bg-danger-ink hover:text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}
