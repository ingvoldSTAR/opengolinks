"use client";

import { useState } from "react";
import { BUTTON_STYLES, contrastRatio, type ButtonStyle } from "@/lib/gallery-render";
import { inputClass, labelClass } from "./forms";

type Theme = { bg_color: string; text_color: string; button_color: string; button_text_color: string; button_style: ButtonStyle };

const PRESETS: { name: string; theme: Theme }[] = [
  { name: "Light", theme: { bg_color: "#f7f5f2", text_color: "#220c10", button_color: "#004ba8", button_text_color: "#ffffff", button_style: "rounded" } },
  { name: "Dark", theme: { bg_color: "#1a1013", text_color: "#f7f5f2", button_color: "#f7f5f2", button_text_color: "#1a1013", button_style: "rounded" } },
  { name: "Cobalt", theme: { bg_color: "#004ba8", text_color: "#ffffff", button_color: "#ffffff", button_text_color: "#004ba8", button_style: "pill" } },
  { name: "Sand", theme: { bg_color: "#efe6dc", text_color: "#220c10", button_color: "#220c10", button_text_color: "#ffffff", button_style: "square" } },
];

const COLOUR_FIELDS: { key: keyof Theme; label: string }[] = [
  { key: "bg_color", label: "Background" },
  { key: "text_color", label: "Text" },
  { key: "button_color", label: "Buttons" },
  { key: "button_text_color", label: "Button text" },
];

const STYLE_LABELS: Record<ButtonStyle, string> = { rounded: "Rounded", pill: "Pill", square: "Square", outline: "Outline" };

/** Colour and button style pickers with one-click presets and a warning when text would be hard to read. */
export function ThemeFields({ defaults }: { defaults: Theme }) {
  const [t, setT] = useState<Theme>(defaults);

  const warnings: string[] = [];
  if (contrastRatio(t.text_color, t.bg_color) < 4.5) warnings.push("The text is hard to read on this background.");
  if (t.button_style === "outline") {
    if (contrastRatio(t.button_color, t.bg_color) < 3) warnings.push("The outline buttons are hard to see on this background.");
  } else if (contrastRatio(t.button_text_color, t.button_color) < 4.5) {
    warnings.push("The button text is hard to read on the button colour.");
  }

  return (
    <div>
      <div className={labelClass}>Look</div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setT(p.theme)}
            className="flex items-center gap-2 rounded-md border border-licorice/20 bg-white px-3 py-1.5 text-xs font-medium hover:border-licorice/50"
          >
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 rounded-full border border-licorice/20"
              style={{ background: `linear-gradient(135deg, ${p.theme.bg_color} 50%, ${p.theme.button_color} 50%)` }}
            />
            {p.name}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3">
        {COLOUR_FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.key} className="mb-1 block text-xs text-licorice/70">{f.label}</label>
            <input
              id={f.key}
              name={f.key}
              type="color"
              value={t[f.key]}
              onChange={(e) => setT((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="h-[38px] w-full cursor-pointer rounded-md border border-licorice/20 bg-white p-1"
            />
          </div>
        ))}
        <div>
          <label htmlFor="button_style" className="mb-1 block text-xs text-licorice/70">Button shape</label>
          <select
            id="button_style"
            name="button_style"
            value={t.button_style}
            onChange={(e) => setT((prev) => ({ ...prev, button_style: e.target.value as ButtonStyle }))}
            className={inputClass}
          >
            {BUTTON_STYLES.map((s) => (
              <option key={s} value={s}>{STYLE_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ember" role="status">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
