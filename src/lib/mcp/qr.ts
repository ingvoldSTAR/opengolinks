import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scanWarning } from "../colour";
import { getGallery } from "../galleries";
import { getLink } from "../links";
import { renderQr } from "../qr";
import { cleanDark, cleanLight, getQrColours, saveQrColours, type QrKind } from "../qrColours";
import { qrTarget } from "../url";
import { CHANGES, READS, defineTool, fail, ok, type Ctx } from "./util";

const HEX = /^#[0-9a-fA-F]{6}$/;

type Subject = { kind: QrKind; id: number; host: string; target: string; page: string };

/** Which link or gallery a QR tool is about: exactly one of the two ids. */
async function subject(linkId?: number, galleryId?: number): Promise<Subject | { error: string }> {
  if ((linkId === undefined) === (galleryId === undefined)) return { error: "Give exactly one of link_id or gallery_id." };
  if (linkId !== undefined) {
    const link = await getLink(linkId);
    return link ? { kind: "link", id: link.id, host: link.host, target: qrTarget(link.host, link.slug), page: `/admin/links/${link.id}` } : { error: "No such link." };
  }
  const gallery = await getGallery(galleryId as number);
  return gallery
    ? { kind: "gallery", id: gallery.id, host: gallery.host, target: qrTarget(gallery.host, gallery.slug), page: `/admin/galleries/${gallery.id}` }
    : { error: "No such gallery." };
}

export function registerQrTools(server: McpServer, ctx: Ctx): void {
  defineTool(
    server,
    "get_qr_code",
    {
      title: "Get a QR code",
      description:
        "Draws the QR code for a link or a gallery, as a PNG image or SVG text. It uses the colours saved for that link or its domain unless you give dark and light. The code encodes the short URL with a marker so QR scans are counted apart from clicks. For a large print file, open the admin page returned here and download at a bigger size.",
      inputSchema: {
        link_id: z.number().int().positive().optional(),
        gallery_id: z.number().int().positive().optional(),
        format: z.enum(["png", "svg"]).default("png"),
        size: z.number().int().min(256).max(1024).default(512).describe("Width in pixels for PNG."),
        dark: z.string().regex(HEX).optional().describe("Code colour as #rrggbb. Defaults to the saved colour."),
        light: z.string().regex(/^(#[0-9a-fA-F]{6}|transparent)$/i).optional().describe('Background as #rrggbb or "transparent". Defaults to the saved colour.'),
      },
      annotations: READS,
    },
    async (a) => {
      const s = await subject(a.link_id, a.gallery_id);
      if (!("kind" in s)) return fail(s.error);
      const saved = await getQrColours(s.kind, s.id);
      const dark = a.dark ? cleanDark(a.dark) : saved.dark;
      const light = a.light ? cleanLight(a.light) : saved.light;
      const { body } = await renderQr(s.target, { format: a.format, size: a.size, level: "Q", dark, light });
      const info = {
        encodes: s.target,
        dark,
        light,
        colours_from: a.dark || a.light ? "this request" : saved.source === "default" ? "default (black on white)" : `saved for this ${saved.source === "own" ? s.kind : `domain ${s.host}`}`,
        warning: scanWarning(dark, light),
        admin_page: `${ctx.origin}${s.page}`,
      };
      if (a.format === "svg") return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }, { type: "text", text: String(body) }] };
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }, { type: "image", data: Buffer.from(body as Buffer).toString("base64"), mimeType: "image/png" }] };
    },
  );

  defineTool(
    server,
    "set_qr_colours",
    {
      title: "Save QR code colours",
      description:
        "Saves the colours used for a link's or gallery's QR code (and its downloads). IMPORTANT: ask the person first whether the colours should apply to every QR code on that domain, then pass their answer as apply_to_domain. true makes them the domain's colours and replaces any individual colours on that domain's links and galleries. false saves them for this one only. Ask again each time colours change. Use dark and light together in one call.",
      inputSchema: {
        link_id: z.number().int().positive().optional(),
        gallery_id: z.number().int().positive().optional(),
        dark: z.string().regex(HEX).describe("Code colour as #rrggbb. Keep it dark so phones can scan it."),
        light: z.string().regex(/^(#[0-9a-fA-F]{6}|transparent)$/i).describe('Background as #rrggbb, or "transparent" for none.'),
        apply_to_domain: z.boolean().describe("The person's answer to: use these colours for every QR code on this domain?"),
      },
      annotations: CHANGES,
    },
    async (a) => {
      const s = await subject(a.link_id, a.gallery_id);
      if (!("kind" in s)) return fail(s.error);
      const dark = cleanDark(a.dark);
      const light = cleanLight(a.light);
      const saved = await saveQrColours(s.kind, s.id, dark, light, a.apply_to_domain);
      if (!saved) return fail("That item no longer exists.");
      return ok({
        saved: a.apply_to_domain ? `For every QR code on ${saved.host}` : "For this QR code only",
        dark,
        light,
        warning: scanWarning(dark, light),
      });
    },
  );
}
