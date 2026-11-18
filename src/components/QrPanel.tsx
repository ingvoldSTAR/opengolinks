"use client";

import { useState } from "react";
import { inputClass, labelClass } from "./forms";

export function QrPanel({ id, target, base: baseOverride }: { id: number; target: string; base?: string }) {
  const [size, setSize] = useState("1024");
  const [ec, setEc] = useState("Q");
  const [dark, setDark] = useState("#000000");

  const params = (extra: Record<string, string>) =>
    new URLSearchParams({ size, ec, dark, ...extra }).toString();
  const base = baseOverride ?? `/api/qr/${id}`;

  return (
    <section className="rounded-lg border border-licorice/10 bg-white p-5">
      <h2 className="text-sm font-semibold">QR code</h2>
      <p className="mt-1 break-all text-xs text-licorice/70">{target}</p>

      <div className="mt-4 flex justify-center rounded-md border border-licorice/10 p-3">
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
          <label className={labelClass} htmlFor="qr-dark">Colour</label>
          <input
            id="qr-dark"
            type="color"
            value={dark}
            onChange={(e) => setDark(e.target.value)}
            className="h-[38px] w-full cursor-pointer rounded-md border border-licorice/20 bg-white p-1"
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-licorice/60">Keep the colour dark on the white background so phones scan it reliably.</p>

      <div className="mt-4 flex gap-2">
        <a
          href={`${base}?${params({ format: "svg", download: "1" })}`}
          className="rounded-md bg-cobalt px-4 py-2 text-sm font-medium text-white hover:bg-licorice"
        >
          Download SVG
        </a>
        <a
          href={`${base}?${params({ format: "png", download: "1" })}`}
          className="rounded-md border border-licorice/20 bg-white px-4 py-2 text-sm font-medium hover:border-licorice/50"
        >
          Download PNG
        </a>
      </div>
    </section>
  );
}
