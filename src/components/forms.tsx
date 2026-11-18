"use client";

import { createContext, useActionState, useContext, useEffect, useTransition } from "react";
import { useFormStatus } from "react-dom";

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
  useEffect(() => {
    if (state?.ok) onOk?.();
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
        <p role="alert" className="mt-3 text-sm text-ember">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="mt-3 text-sm text-cobalt">
          {state.ok}
        </p>
      )}
      {state?.details && state.details.length > 0 && (
        <ul className="mt-3 max-h-72 list-disc space-y-1 overflow-auto rounded-md bg-licorice/5 py-3 pl-8 pr-4 text-sm text-licorice/80">
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
      ? "bg-cobalt text-white hover:bg-licorice"
      : "border border-licorice/20 bg-white text-licorice hover:border-licorice/50";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${styles}`}
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
      className="rounded-md border border-ember/40 px-3 py-2 text-sm font-medium text-ember transition-colors hover:bg-ember hover:text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export const inputClass =
  "w-full rounded-md border border-licorice/20 bg-white px-3 py-2 text-sm outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt/20";
export const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-licorice/70";
