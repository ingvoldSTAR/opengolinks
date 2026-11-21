// Plain strings, kept out of the "use client" form components so server pages can read them
// (a constant imported from a client module is a reference there, not a value).
export const inputClass =
  "w-full rounded-lg border border-ink/20 bg-white px-3 py-2.5 text-sm text-ink outline-none transition-shadow placeholder:text-mute focus:border-accent focus:ring-[3px] focus:ring-accent/15";
export const labelClass = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink/70";
