import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { parseHexColour } from "./validate";

const LEVELS = ["L", "M", "Q", "H"] as const;
export type QrLevel = (typeof LEVELS)[number];

export type QrOptions = { format: "svg" | "png"; size: number; level: QrLevel; dark: string; light: string };

/** Reads the panel's query string (size, ec, dark, light, format) into safe options. */
export function qrOptionsFrom(sp: URLSearchParams): QrOptions {
  const requested = sp.get("ec") as QrLevel | null;
  const lightParam = sp.get("light");
  return {
    format: sp.get("format") === "png" ? "png" : "svg",
    size: Math.min(4096, Math.max(256, Math.round(Number(sp.get("size"))) || 1024)),
    level: requested && LEVELS.includes(requested) ? requested : "Q",
    dark: parseHexColour(sp.get("dark"), "#000000"),
    // "transparent" gives a clear background (fully transparent PNG, no background rectangle in the SVG).
    light: lightParam === "transparent" ? "transparent" : parseHexColour(lightParam, "#ffffff"),
  };
}

/** Draws a QR code. Used by the download route and by the MCP tools. */
export async function renderQr(target: string, o: QrOptions): Promise<{ body: Buffer | string; contentType: string }> {
  const options = {
    errorCorrectionLevel: o.level,
    margin: 4,
    width: o.size,
    color: { dark: o.dark, light: o.light === "transparent" ? "#00000000" : o.light },
  } as const;
  if (o.format === "svg") return { body: await QRCode.toString(target, { ...options, type: "svg" }), contentType: "image/svg+xml" };
  return { body: await QRCode.toBuffer(target, { ...options, type: "png" }), contentType: "image/png" };
}

/** Builds the SVG or PNG response for a QR code from the panel's query string (size, ec, dark, light, format, download). */
export async function qrResponse(target: string, filenameBase: string, sp: URLSearchParams): Promise<NextResponse> {
  const options = qrOptionsFrom(sp);
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (sp.get("download")) headers["Content-Disposition"] = `attachment; filename="${filenameBase}-qr.${options.format}"`;
  const { body, contentType } = await renderQr(target, options);
  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), { headers: { ...headers, "Content-Type": contentType } });
}
