"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink sm:py-1.5 font-semibold transition-colors hover:border-accent hover:text-accent-deep"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
