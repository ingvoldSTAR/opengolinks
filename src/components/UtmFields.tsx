"use client";

import { useCallback, useEffect, useState } from "react";
import { UTM_KEYS, cleanUtmValue, withUtm, type Utm, type UtmKey } from "@/lib/utm";
import { CopyButton } from "./CopyButton";
import { Drawer } from "./Drawer";
import { SlidersIcon } from "./Icons";
import { inputClass, labelClass } from "./styles";

const SOURCES = ["newsletter", "linkedin", "facebook", "instagram", "whatsapp", "google", "poster", "flyer", "brochure", "event"];
const MEDIUMS = ["email", "social", "paid-social", "qr", "print", "cpc", "referral", "sms", "event"];

const PRESETS: { label: string; source: string; medium: string }[] = [
  { label: "LinkedIn", source: "linkedin", medium: "paid-social" },
  { label: "Meta Ads", source: "facebook", medium: "paid-social" },
  { label: "Google Search (CPC)", source: "google", medium: "cpc" },
  { label: "Newsletter", source: "newsletter", medium: "email" },
  { label: "Instagram", source: "instagram", medium: "social" },
  { label: "Print and QR", source: "poster", medium: "qr" },
];

const EMPTY: Utm = { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null };

// One shade per parameter in the live address, so each value is easier to find.
const PARAM_COLOUR: Record<UtmKey, string> = {
  utm_source: "text-ink",
  utm_medium: "text-zinc-500",
  utm_campaign: "text-zinc-800",
  utm_term: "text-zinc-600",
  utm_content: "text-zinc-700",
};

const chip = "rounded-md bg-ground px-2.5 py-1.5 text-xs font-semibold text-ink/80 transition-colors hover:bg-accent-tint hover:text-accent-ink";

/** Campaign tracking: a summary row in the form, and a drawer to fill it in with a live preview of the final address. */
export function UtmFields({ defaults, destinationId = "destination" }: { defaults?: Partial<Utm>; destinationId?: string }) {
  const [values, setValues] = useState<Record<UtmKey, string>>(
    () => Object.fromEntries(UTM_KEYS.map((k) => [k, defaults?.[k] ?? ""])) as Record<UtmKey, string>,
  );
  const [destination, setDestination] = useState("");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

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
  const setKeys = UTM_KEYS.filter((k) => cleaned[k]);
  const anySet = setKeys.length > 0;
  const full = destination && anySet ? withUtm(destination, cleaned) : "";
  const set = (k: UtmKey, v: string) => setValues((cur) => ({ ...cur, [k]: v }));
  const summary = setKeys.map((k) => cleaned[k]).join(" / ");

  // The address as parts, so the added parameters can be coloured.
  const base = destination ? destination.split(/[?#]/)[0] : "";
  const live = setKeys.map((k) => ({ k, text: `${k}=${encodeURIComponent(cleaned[k] as string)}` }));

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-bold">Campaign tracking (UTM)</div>
          <div className="truncate text-xs text-mute">
            {anySet ? summary : "Optional. Tags the destination so your analytics can tell where visits came from."}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold transition-colors hover:border-accent hover:text-accent-deep"
        >
          {anySet ? "Edit" : "Add tracking"}
        </button>
      </div>

      <Drawer
        open={open}
        onClose={close}
        keepMounted
        title="Campaign tracking"
        icon={<SlidersIcon />}
        description="Add UTM values so your analytics can tell where each visit came from. They are added when someone follows the link, so the printed link and QR code never change."
        footer={
          <>
            <button
              type="button"
              onClick={() => setValues(Object.fromEntries(UTM_KEYS.map((k) => [k, ""])) as Record<UtmKey, string>)}
              className="rounded-lg px-3 py-2.5 text-sm font-semibold text-ink/75 transition-colors hover:bg-ground hover:text-ink"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-deep"
            >
              Done
            </button>
          </>
        }
      >
        <div className="space-y-7">
          <section aria-labelledby="utm-presets">
            <h3 id="utm-presets" className={labelClass}>Quick presets</h3>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active = cleaned.utm_source === p.source && cleaned.utm_medium === p.medium;
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setValues((cur) => ({ ...cur, utm_source: p.source, utm_medium: p.medium }))}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? "bg-ink text-white" : "bg-ground text-ink/80 hover:bg-accent-tint hover:text-accent-ink"}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-mute">A preset fills in source and medium. You choose the campaign.</p>
          </section>

          <section className="space-y-5" aria-label="Parameters">
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="utm_campaign" className={labelClass}>Campaign</label>
                <span className="font-mono text-xs text-mute">utm_campaign</span>
              </div>
              <input id="utm_campaign" name="utm_campaign" value={values.utm_campaign} onChange={(e) => set("utm_campaign", e.target.value)} placeholder="spring-launch-2026" autoComplete="off" className={inputClass} data-autofocus />
              <p className="mt-1 text-xs text-mute">The initiative this link belongs to. Links with the same campaign are reported together.</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="utm_source" className={labelClass}>Source</label>
                  <span className="font-mono text-xs text-mute">utm_source</span>
                </div>
                <input id="utm_source" name="utm_source" value={values.utm_source} onChange={(e) => set("utm_source", e.target.value)} placeholder="newsletter" autoComplete="off" className={inputClass} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SOURCES.slice(0, 5).map((s) => (
                    <button key={s} type="button" onClick={() => set("utm_source", s)} className={chip}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="utm_medium" className={labelClass}>Medium</label>
                  <span className="font-mono text-xs text-mute">utm_medium</span>
                </div>
                <input id="utm_medium" name="utm_medium" value={values.utm_medium} onChange={(e) => set("utm_medium", e.target.value)} placeholder="email" autoComplete="off" className={inputClass} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MEDIUMS.slice(0, 5).map((m) => (
                    <button key={m} type="button" onClick={() => set("utm_medium", m)} className={chip}>{m}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="utm_term" className={labelClass}>Term <span className="font-normal normal-case tracking-normal">(optional)</span></label>
                  <span className="font-mono text-xs text-mute">utm_term</span>
                </div>
                <input id="utm_term" name="utm_term" value={values.utm_term} onChange={(e) => set("utm_term", e.target.value)} autoComplete="off" className={inputClass} />
                <p className="mt-1 text-xs text-mute">Paid search keyword.</p>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="utm_content" className={labelClass}>Content <span className="font-normal normal-case tracking-normal">(optional)</span></label>
                  <span className="font-mono text-xs text-mute">utm_content</span>
                </div>
                <input id="utm_content" name="utm_content" value={values.utm_content} onChange={(e) => set("utm_content", e.target.value)} autoComplete="off" className={inputClass} />
                <p className="mt-1 text-xs text-mute">Tells two versions apart, such as banner or text-link.</p>
              </div>
            </div>
          </section>

          <section aria-labelledby="utm-live" className="rounded-xl bg-ground p-4">
            <div className="flex items-center justify-between">
              <h3 id="utm-live" className={`${labelClass} mb-0`}>Visitors will land on</h3>
              {full && <span className="text-xs text-mute">{full.length} characters</span>}
            </div>
            <p className="mt-3 break-all rounded-lg bg-white px-3 py-2.5 font-mono text-[13px] leading-relaxed">
              {destination ? (
                <>
                  <span className="text-ink">{base}</span>
                  {live.map((part, i) => (
                    <span key={part.k}>
                      <span className="text-mute">{i === 0 ? "?" : "&"}</span>
                      <span className={`font-bold ${PARAM_COLOUR[part.k]}`}>{part.text}</span>
                    </span>
                  ))}
                  {!anySet && <span className="text-mute"> (no tracking yet)</span>}
                </>
              ) : (
                <span className="text-mute">Enter a destination in the form to see the full address.</span>
              )}
            </p>
            {full && (
              <div className="mt-3">
                <CopyButton value={full} label="Copy full address" />
              </div>
            )}
            <p className="mt-3 text-xs text-mute">
              Values are saved in lower case, with hyphens for spaces. They replace any UTM values already in the destination.
            </p>
          </section>
        </div>
      </Drawer>
    </>
  );
}
