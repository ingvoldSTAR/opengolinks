"use client";

import { useState } from "react";
import { inputClass, labelClass } from "./styles";

type Background = "white" | "transparent" | "custom";

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const CHECKERBOARD = {
  backgroundImage:
    "linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
} as const;

export function QrPanel({ id, target, base: baseOverride }: { id: number; target: string; base?: string }) {
  const [size, setSize] = useState("1024");
  const [ec, setEc] = useState("Q");
  const [dark, setDark] = useState("#000000");
  const [bg, setBg] = useState<Background>("white");
  const [custom, setCustom] = useState("#ffffff");

  const light = bg === "transparent" ? "transparent" : bg === "custom" ? custom : "#ffffff";
  const bgColour = bg === "custom" ? custom : "#ffffff";
  const warning =
    bg === "transparent"
      ? null
      : luminance(dark) >= luminance(bgColour)
        ? "The code is lighter than its background. Many phones cannot scan an inverted QR code, so make the code darker than the background."
        : contrast(dark, bgColour) < 4
          ? "Low contrast between the code and its background. Choose a darker code or a lighter background so it scans reliably."
          : null;
  const params = (extra: Record<string, string>) =>
    new URLSearchParams({ size, ec, dark, light, ...extra }).toString();
  const base = baseOverride ?? `/api/qr/${id}`;

  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold">QR code</h2>
      <p className="mt-1 break-all text-xs text-mute">{target}</p>

      <div
        className="mt-4 flex justify-center rounded-md border border-line p-3"
        style={bg === "transparent" ? CHECKERBOARD : bg === "custom" ? { backgroundColor: custom } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${base}?${params({ format: "svg" })}`}
          alt={`QR code for ${target}`}
          width={220}
          height={220}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass} htmlFor="qr-size">PNG size</label>
          <select id="qr-size" className={inputClass} value={size} onChange={(e) => setSize(e.target.value)}>
            {["512", "1024", "2048", "4096"].map((s) => (
              <option key={s} value={s}>{s} px</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="qr-ec">Error correction</label>
          <select id="qr-ec" className={inputClass} value={ec} onChange={(e) => setEc(e.target.value)}>
            <option value="M">M, standard</option>
            <option value="Q">Q, print</option>
            <option value="H">H, highest</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="qr-dark">Code colour</label>
          <input
            id="qr-dark"
            type="color"
            value={dark}
            onChange={(e) => setDark(e.target.value)}
            className="h-[38px] w-full cursor-pointer rounded-lg border border-line bg-white p-1"
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className={bg === "custom" ? "" : "col-span-2"}>
          <label className={labelClass} htmlFor="qr-bg">Background</label>
          <select id="qr-bg" className={inputClass} value={bg} onChange={(e) => setBg(e.target.value as Background)}>
            <option value="white">White</option>
            <option value="transparent">None (transparent)</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {bg === "custom" && (
          <div className="col-span-2">
            <label className={labelClass} htmlFor="qr-bg-colour">Background colour</label>
            <input
              id="qr-bg-colour"
              type="color"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-[38px] w-full cursor-pointer rounded-lg border border-line bg-white p-1"
            />
          </div>
        )}
      </div>
      {warning ? (
        <p role="status" className="mt-3 rounded-lg bg-danger-tint px-3 py-2 text-xs font-medium text-danger-ink">{warning}</p>
      ) : (
        <p className="mt-2 text-xs text-mute">
          {bg === "transparent"
            ? "The QR code has no background, so it takes the colour of whatever it is placed on. Place it on a light surface and keep the code dark."
            : "Keep the code dark on a light background so phones scan it reliably."}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <a
          href={`${base}?${params({ format: "svg", download: "1" })}`}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-ink"
        >
          Download SVG
        </a>
        <a
          href={`${base}?${params({ format: "png", download: "1" })}`}
          className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent-deep"
        >
          Download PNG
        </a>
      </div>
    </section>
  );
}
