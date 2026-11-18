import { ICONS, NETWORK_LABELS, NETWORKS, type Network } from "./gallery-icons";

/* ---------- Types ---------- */

export type ButtonStyle = "rounded" | "pill" | "square" | "outline";
export const BUTTON_STYLES: ButtonStyle[] = ["rounded", "pill", "square", "outline"];

export type GalleryRow = {
  id: number;
  domain_id: number;
  host: string;
  slug: string;
  title: string;
  bio: string | null;
  avatar: string | null;
  bg_color: string;
  text_color: string;
  button_color: string;
  button_text_color: string;
  button_style: ButtonStyle;
  footer: string | null;
  published: boolean;
  created_at: Date;
  updated_at: Date;
};

export type ItemKind = "link" | "social" | "image" | "video";

export type ItemRow = {
  id: number;
  gallery_id: number;
  position: number;
  kind: ItemKind;
  label: string | null;
  url: string | null;
  image: string | null;
  network: string | null;
  hidden: boolean;
};

/* ---------- Safety helpers. Everything on the public page goes through these. ---------- */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string | null | undefined): string => (s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** http(s) only. Returns the normalised URL or null. */
export function safeHttpUrl(input: string | null | undefined): string | null {
  try {
    const u = new URL((input ?? "").trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** http(s), or an email address as mailto:. Nothing else, so no javascript: or data: links. */
export function safeLinkUrl(input: string | null | undefined): string | null {
  const v = (input ?? "").trim();
  if (/^mailto:[^\s<>"']+@[^\s<>"']+$/i.test(v)) return v;
  if (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v)) return "mailto:" + v;
  return safeHttpUrl(v);
}

export const MAX_IMAGE_DATA_URL = 400_000;

/** An https image URL, or a small data:image URL made by the upload field. */
export function safeImageSrc(input: string | null | undefined): string | null {
  const v = (input ?? "").trim();
  if (v.length <= MAX_IMAGE_DATA_URL && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function youtubeId(input: string | null | undefined): string | null {
  let u: URL;
  try {
    u = new URL((input ?? "").trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const valid = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null);
  if (host === "youtu.be") return valid(u.pathname.split("/")[1]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v) return valid(v);
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
    return valid(m?.[1]);
  }
  return null;
}

export function hexColour(input: string | null | undefined, fallback: string): string {
  const v = (input ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21). 4.5 or more reads comfortably. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(hexColour(a, "#000000")), luminance(hexColour(b, "#ffffff"))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- Page ---------- */

const isNetwork = (n: string | null): n is Network => !!n && (NETWORKS as readonly string[]).includes(n);

function socialIcon(network: Network): string {
  const icon = ICONS[network];
  const attrs = icon.stroke
    ? 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
    : 'fill="currentColor"';
  return `<svg viewBox="0 0 24 24" width="22" height="22" ${attrs} aria-hidden="true"><path d="${icon.path}"/></svg>`;
}

/** Content-Security-Policy for gallery pages: no scripts at all, images over https or data, YouTube frames only. */
export const GALLERY_CSP =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; frame-src https://www.youtube-nocookie.com; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

export function renderGalleryHtml(g: GalleryRow, items: ItemRow[], opts: { itemHref: (item: ItemRow) => string }): string {
  const bg = hexColour(g.bg_color, "#f7f5f2");
  const fg = hexColour(g.text_color, "#220c10");
  const btn = hexColour(g.button_color, "#004ba8");
  const btnText = hexColour(g.button_text_color, "#ffffff");
  const style: ButtonStyle = BUTTON_STYLES.includes(g.button_style) ? g.button_style : "rounded";
  const radius = style === "pill" ? "999px" : style === "square" ? "0" : "14px";
  const buttonCss =
    style === "outline"
      ? `background:transparent;color:${btn};border:2px solid ${btn}`
      : `background:${btn};color:${btnText};border:2px solid ${btn}`;

  const visible = items.filter((i) => !i.hidden).sort((a, b) => a.position - b.position || a.id - b.id);
  // Web links go through the counting route. Email links are direct, since browsers are patchy about redirects to mailto:.
  const hrefFor = (i: ItemRow): string => {
    const u = safeLinkUrl(i.url);
    return u && u.startsWith("mailto:") ? u : opts.itemHref(i);
  };

  const social = visible
    .filter((i) => i.kind === "social" && isNetwork(i.network) && safeLinkUrl(i.url))
    .map(
      (i) =>
        `<a class="icon" href="${esc(hrefFor(i))}" rel="noopener nofollow" aria-label="${esc(NETWORK_LABELS[i.network as Network])}">${socialIcon(i.network as Network)}</a>`,
    )
    .join("");

  const blocks = visible
    .map((i) => {
      if (i.kind === "link") {
        if (!safeLinkUrl(i.url) || !i.label) return "";
        return `<a class="btn" href="${esc(hrefFor(i))}" rel="noopener nofollow">${esc(i.label)}</a>`;
      }
      if (i.kind === "image") {
        const src = safeImageSrc(i.image);
        if (!src) return "";
        const img = `<img src="${esc(src)}" alt="${esc(i.label)}" loading="lazy">`;
        return `<figure class="media">${safeLinkUrl(i.url) ? `<a href="${esc(hrefFor(i))}" rel="noopener nofollow">${img}</a>` : img}${i.label ? `<figcaption>${esc(i.label)}</figcaption>` : ""}</figure>`;
      }
      if (i.kind === "video") {
        const id = youtubeId(i.url);
        if (!id) return "";
        return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${esc(i.label || "Video")}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
      }
      return "";
    })
    .join("");

  const avatar = safeImageSrc(g.avatar);
  const ogImage = avatar && avatar.startsWith("https:") ? avatar : null;
  const description = (g.bio ?? "").trim().replace(/\s+/g, " ").slice(0, 200);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(g.title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
<meta property="og:title" content="${esc(g.title)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ""}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
<meta property="og:type" content="website">
<style>
*{box-sizing:border-box}
body{margin:0;background:${bg};color:${fg};font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:560px;margin:0 auto;padding:40px 20px 56px;text-align:center}
.avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 16px}
h1{margin:0;font-size:1.5rem;line-height:1.25}
.bio{margin:8px 0 0;white-space:pre-line;opacity:.85}
.social{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin:20px 0 4px}
.icon{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;border:2px solid ${fg};color:${fg};text-decoration:none}
.icon:hover,.icon:focus-visible{background:${fg};color:${bg}}
.list{display:flex;flex-direction:column;gap:14px;margin-top:24px}
.btn{display:block;padding:15px 18px;border-radius:${radius};${buttonCss};text-decoration:none;font-weight:600;overflow-wrap:anywhere;transition:transform .12s ease,opacity .12s ease}
.btn:hover,.btn:focus-visible{transform:translateY(-1px);opacity:.92}
.btn:focus-visible,.icon:focus-visible{outline:3px solid ${fg};outline-offset:3px}
.media{margin:0}
.media img{display:block;width:100%;height:auto;border-radius:${radius === "0" ? "0" : "14px"}}
.media figcaption{margin-top:6px;font-size:.875rem;opacity:.8}
.video{position:relative;aspect-ratio:16/9;border-radius:${radius === "0" ? "0" : "14px"};overflow:hidden;background:#000}
.video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.footer{margin-top:36px;font-size:.8125rem;opacity:.7;white-space:pre-line}
@media (prefers-reduced-motion:reduce){.btn{transition:none}.btn:hover{transform:none}}
</style>
</head>
<body>
<main>
${avatar ? `<img class="avatar" src="${esc(avatar)}" alt="">` : ""}
<h1>${esc(g.title)}</h1>
${g.bio?.trim() ? `<p class="bio">${esc(g.bio.trim())}</p>` : ""}
${social ? `<nav class="social" aria-label="Social links">${social}</nav>` : ""}
<div class="list">${blocks}</div>
${g.footer?.trim() ? `<p class="footer">${esc(g.footer.trim())}</p>` : ""}
</main>
</body>
</html>`;
}
