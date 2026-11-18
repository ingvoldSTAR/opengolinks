"use client";

import { useEffect, useState } from "react";
import { UTM_KEYS, cleanUtmValue, withUtm, type Utm, type UtmKey } from "@/lib/utm";
import { inputClass, labelClass } from "./forms";

const FIELDS: { key: UtmKey; label: string; hint: string; list?: string; placeholder: string }[] = [
  { key: "utm_campaign", label: "Campaign", hint: "The initiative this link belongs to.", placeholder: "spring-launch-2026" },
  { key: "utm_source", label: "Source", hint: "Where the link is placed.", list: "utm-sources", placeholder: "newsletter" },
  { key: "utm_medium", label: "Medium", hint: "How people reach it.", list: "utm-mediums", placeholder: "email" },
  { key: "utm_term", label: "Term (optional)", hint: "Paid search keyword.", placeholder: "" },
  { key: "utm_content", label: "Content (optional)", hint: "Tells two versions apart, for example banner or text-link.", placeholder: "" },
];

const SOURCES = ["newsletter", "linkedin", "facebook", "instagram", "whatsapp", "google", "poster", "flyer", "brochure", "event"];
const MEDIUMS = ["email", "social", "qr", "print", "cpc", "referral", "sms", "event"];

const EMPTY: Utm = { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null };

/** Campaign tracking fields with a live preview of where visitors will land. */
export function UtmFields({ defaults, destinationId = "destination" }: { defaults?: Partial<Utm>; destinationId?: string }) {
  const [values, setValues] = useState<Record<UtmKey, string>>(
    () => Object.fromEntries(UTM_KEYS.map((k) => [k, defaults?.[k] ?? ""])) as Record<UtmKey, string>,
  );
  const [destination, setDestination] = useState("");

  // The destination input lives in the parent form, so follow it from here.
  useEffect(() => {
    const el = document.getElementById(destinationId) as HTMLInputElement | null;
    if (!el) return;
    const sync = () => setDestination(el.value.trim());
    sync();
    el.addEventListener("input", sync);
    return () => el.removeEventListener("input", sync);
  }, [destinationId]);

  const cleaned: Utm = { ...EMPTY };
  for (const k of UTM_KEYS) cleaned[k] = cleanUtmValue(values[k]);
  const anySet = UTM_KEYS.some((k) => cleaned[k]);
  const preview = destination && anySet ? withUtm(destination, cleaned) : "";

  return (
    <details open={anySet} className="rounded-md border border-licorice/15 px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        Campaign tracking (UTM)
        <span className="ml-2 text-xs font-normal text-licorice/60">
          {anySet ? "On" : "Optional. Tags the destination so your analytics can tell where visits came from."}
        </span>
      </summary>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.key} className={labelClass}>{f.label}</label>
            <input
              id={f.key}
              name={f.key}
              list={f.list}
              placeholder={f.placeholder}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className={inputClass}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-licorice/60">{f.hint}</p>
          </div>
        ))}
      </div>
      <datalist id="utm-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="utm-mediums">{MEDIUMS.map((m) => <option key={m} value={m} />)}</datalist>

      {anySet && (
        <div className="mt-4">
          <div className={labelClass}>Visitors will land on</div>
          <p className="break-all rounded-md bg-licorice/5 px-3 py-2 font-mono text-xs">
            {preview || "Enter a destination above to see the full URL."}
          </p>
        </div>
      )}
      <p className="mt-3 text-xs text-licorice/60">
        Values are saved in lower case with hyphens for spaces, so &ldquo;Spring Launch&rdquo; and &ldquo;spring-launch&rdquo; count as one
        campaign. These values replace any UTM values already in the destination. Renaming a campaign relabels past clicks too.
      </p>
    </details>
  );
}
