import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { parseHexColour } from "./validate";

const LEVELS = ["L", "M", "Q", "H"] as const;
type Level = (typeof LEVELS)[number];

/** Builds the SVG or PNG response for a QR code from the panel's query string (size, ec, dark, light, format, download). */
export async function qrResponse(target: string, filenameBase: string, sp: URLSearchParams): Promise<NextResponse> {
  const format = sp.get("format") === "png" ? "png" : "svg";
  const size = Math.min(4096, Math.max(256, Math.round(Number(sp.get("size"))) || 1024));
  const requested = sp.get("ec") as Level | null;
  const level: Level = requested && LEVELS.includes(requested) ? requested : "Q";
  const dark = parseHexColour(sp.get("dark"), "#000000");
  const light = parseHexColour(sp.get("light"), "#ffffff");
  const options = { errorCorrectionLevel: level, margin: 4, width: size, color: { dark, light } } as const;

  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (sp.get("download")) headers["Content-Disposition"] = `attachment; filename="${filenameBase}-qr.${format}"`;

  if (format === "svg") {
    const svg = await QRCode.toString(target, { ...options, type: "svg" });
    return new NextResponse(svg, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  }
  const png = await QRCode.toBuffer(target, { ...options, type: "png" });
  return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
}
