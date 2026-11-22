// Colour maths shared by the QR panel and the MCP tools. No imports: it also runs in the browser.

/** Relative luminance of a #rrggbb colour (WCAG). */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Why a code in `dark` on `light` might not scan, or null when it should. `light` may be "transparent". */
export function scanWarning(dark: string, light: string): string | null {
  if (light === "transparent") return null;
  if (luminance(dark) >= luminance(light)) {
    return "The code is lighter than its background. Many phones cannot scan an inverted QR code, so make the code darker than the background.";
  }
  if (contrast(dark, light) < 4) {
    return "Low contrast between the code and its background. Choose a darker code or a lighter background so it scans reliably.";
  }
  return null;
}
