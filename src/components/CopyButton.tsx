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
      className="rounded-md border border-licorice/20 bg-white px-3 py-1.5 text-xs font-medium hover:border-licorice/50"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
