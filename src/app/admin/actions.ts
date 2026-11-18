"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { checkPassword, endSession, requireAdmin, startSession } from "@/lib/auth";
import { currentHost, isAdminHost } from "@/lib/host";
import { loginSucceeded, startLoginAttempt } from "@/lib/ratelimit";
import { CSV_MAX_BYTES, csvRecords } from "@/lib/csv";
import { planImport, type ImportRecord } from "@/lib/import";
import {
  SlugTakenError,
  createDomain,
  createLink,
  deleteDomain,
  deleteLink,
  existingLinkMap,
  importLinks,
  listDomains,
  updateDomain,
  updateLink,
} from "@/lib/links";
import {
  addItem,
  createGallery,
  deleteGallery,
  deleteItem,
  getGallery,
  getItem,
  moveItem,
  setItemHidden,
  updateGallery,
  updateItem,
} from "@/lib/galleries";
import { NETWORKS } from "@/lib/gallery-icons";
import {
  BUTTON_STYLES,
  hexColour,
  safeImageSrc,
  safeLinkUrl,
  youtubeId,
  type ButtonStyle,
  type ItemKind,
} from "@/lib/gallery-render";
import { RebrandlyError, fetchAllLinks, rebrandlyRecords } from "@/lib/rebrandly";
import { UTM_KEYS, cleanUtmValue, type Utm } from "@/lib/utm";
import {
  apexUrl,
  parseHostInput,
  parseOptionalUrl,
  parseRedirectCode,
  parseSlug,
  parseUrl,
  randomSlug,
} from "@/lib/validate";

type State = { error?: string; ok?: string; details?: string[] } | undefined;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const utmFromForm = (fd: FormData): Utm =>
  Object.fromEntries(UTM_KEYS.map((k) => [k, cleanUtmValue(String(fd.get(k) ?? ""))])) as Utm;
const code = (e: unknown) => (e as { code?: string } | null)?.code;

export async function loginAction(_prev: State, fd: FormData): Promise<State> {
  if (!isAdminHost(await currentHost())) notFound();
  const gate = await startLoginAttempt();
  if (!gate.allowed) return { error: gate.message };
  if (!checkPassword(String(fd.get("password") ?? ""))) {
    await new Promise((r) => setTimeout(r, 600));
    return { error: "Incorrect password." };
  }
  await loginSucceeded(gate.clientKey);
  await startSession();
  redirect("/admin");
}

export async function logoutAction() {
  await endSession();
  redirect("/admin/login");
}

export async function createLinkAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();

  const domainId = Number(fd.get("domain_id"));
  if (!Number.isInteger(domainId) || domainId <= 0) return { error: "Choose a domain." };

  const dest = parseUrl(text(fd, "destination"));
  if (!dest.ok) return { error: dest.error };

  let slug: string | null = null;
  if (text(fd, "slug")) {
    const parsed = parseSlug(text(fd, "slug"));
    if (!parsed.ok) return { error: parsed.error };
    slug = parsed.value;
  }

  let id: number;
  try {
    id = await createLink({
      domainId,
      slug,
      destination: dest.value,
      title: text(fd, "title") || null,
      notes: null,
      redirectCode: 302,
      utm: utmFromForm(fd),
    });
  } catch (e) {
    if (e instanceof SlugTakenError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin");
  redirect(`/admin/links/${id}`);
}

export async function updateLinkAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const dest = parseUrl(text(fd, "destination"));
  if (!dest.ok) return { error: dest.error };
  await updateLink(id, {
    destination: dest.value,
    title: text(fd, "title") || null,
    notes: text(fd, "notes") || null,
    redirectCode: parseRedirectCode(text(fd, "redirect_code")),
    utm: utmFromForm(fd),
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/links/${id}`);
  return { ok: "Saved." };
}

export async function deleteLinkAction(fd: FormData) {
  await requireAdmin();
  await deleteLink(Number(fd.get("id")));
  revalidatePath("/admin");
  redirect("/admin");
}

export async function addDomainAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const host = parseHostInput(text(fd, "host"));
  if (!host.ok) return { error: host.error };
  try {
    // New domains send visitors with no (or a wrong) short link to the main website. Editable on the Domains page.
    const home = apexUrl(host.value);
    await createDomain(host.value, home, home);
  } catch (e) {
    if (code(e) === "23505") return { error: "That domain is already added." };
    throw e;
  }
  revalidatePath("/admin/domains");
  return { ok: apexUrl(host.value) ? `${host.value} added. Visitors without a valid short link go to ${apexUrl(host.value)}.` : `${host.value} added.` };
}

export async function updateDomainAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const root = parseOptionalUrl(text(fd, "root_redirect_url"), "Root redirect");
  if (!root.ok) return { error: root.error };
  const nf = parseOptionalUrl(text(fd, "not_found_url"), "Not found redirect");
  if (!nf.ok) return { error: nf.error };
  await updateDomain(Number(fd.get("id")), root.value, nf.value);
  revalidatePath("/admin/domains");
  return { ok: "Saved." };
}

export async function deleteDomainAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  try {
    await deleteDomain(Number(fd.get("id")));
  } catch (e) {
    if (code(e) === "23001" || code(e) === "23503") return { error: "This domain still has links or galleries. Delete them first." };
    throw e;
  }
  revalidatePath("/admin/domains");
  return { ok: "Removed." };
}

/* ---------- Import ---------- */

const SHOW_LIMIT = 40;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Plans the records and, unless it is a preview, saves them. Every import source ends here, so they follow
 * the same rules and report the same way. `lead` opens the report, for example "Rebrandly returned 12 links".
 */
async function runImport(args: {
  lead: string;
  records: ImportRecord[];
  liftUtm: boolean;
  dryRun: boolean;
  notes?: string[];
}): Promise<State> {
  const { lead, records, liftUtm, dryRun, notes = [] } = args;

  let plan: ReturnType<typeof planImport>;
  let created: number;
  try {
    const domains = new Map((await listDomains()).map((d) => [d.host, d.id]));
    plan = planImport(records, domains, await existingLinkMap(), { liftUtm });
    created = dryRun ? plan.create.length : await importLinks(plan.create);
  } catch (e) {
    // Without this, a database or data problem surfaces as a bare 500 and a crashed form.
    const reason = e instanceof Error ? e.message : "unknown error";
    console.error("[import] database step failed:", reason);
    return {
      error: `${lead}, but they could not be ${dryRun ? "checked" : "saved"}: ${reason.slice(0, 200)}. Links saved before the problem are kept, and running the import again is safe.`,
    };
  }
  if (!dryRun) {
    revalidatePath("/admin");
    revalidatePath("/admin/campaigns");
  }

  const perDomain = new Map<string, number>();
  for (const l of plan.create) perDomain.set(l.host, (perDomain.get(l.host) ?? 0) + 1);

  const details: string[] = [`${lead}.`, ...notes];
  for (const [host, n] of perDomain) details.push(`${host}: ${n} ${dryRun ? "to import" : "imported"}`);
  if (plan.alreadyThere) details.push(`${plan.alreadyThere} already here with the same destination (skipped).`);
  if (plan.utmLifted) details.push(`${plan.utmLifted} had utm_ values in the destination, moved to the campaign fields.`);
  for (const [host, n] of plan.unknownDomains) {
    details.push(`${n} on ${host}: not imported, because that domain is not added here. Add it on the Domains page, then run this again.`);
  }
  for (const s of plan.skipped.slice(0, SHOW_LIMIT)) details.push(`${s.link}: skipped, ${s.reason}.`);
  if (plan.skipped.length > SHOW_LIMIT) details.push(`...and ${plan.skipped.length - SHOW_LIMIT} more skipped.`);

  return dryRun
    ? { ok: `Preview only: ${plural(created, "link", "links")} would be imported. Untick "Preview only" and press Import to do it.`, details }
    : { ok: `Imported ${plural(created, "link", "links")}.`, details };
}

/** One-off import of an existing Rebrandly workspace. The API key is used for this request only and never stored. */
export async function importRebrandlyAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();

  const apiKey = text(fd, "api_key");
  if (!apiKey) return { error: "Paste your Rebrandly API key." };
  const workspace = text(fd, "workspace") || null;
  const dryRun = fd.get("dry_run") === "on";
  const liftUtm = fd.get("lift_utm") === "on";

  let fetched;
  try {
    fetched = await fetchAllLinks(apiKey, workspace);
  } catch (e) {
    if (e instanceof RebrandlyError) return { error: e.message };
    console.error("[import] unexpected failure:", e instanceof Error ? e.message : "unknown");
    return { error: "The import failed unexpectedly. Check the server logs." };
  }

  return runImport({
    lead: `Rebrandly returned ${plural(fetched.links.length, "link", "links")}`,
    records: rebrandlyRecords(fetched.links),
    liftUtm,
    dryRun,
    notes: fetched.truncated ? ["Stopped at 20,000 links. Run it again after this batch is imported."] : [],
  });
}

/** Import from an uploaded CSV file (see csv.ts for the columns). Nothing is stored apart from the links themselves. */
export async function importCsvAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();

  const file = fd.get("csv_file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > CSV_MAX_BYTES) {
    return { error: `That file is over ${CSV_MAX_BYTES / 1_000_000} MB. Split it into smaller files and import them one at a time.` };
  }
  const dryRun = fd.get("dry_run") === "on";

  let parsed: ReturnType<typeof csvRecords>;
  try {
    parsed = csvRecords(await file.text());
  } catch (e) {
    console.error("[import] could not read the CSV file:", e instanceof Error ? e.message : "unknown");
    return { error: "That file could not be read. Save it as a CSV file in UTF-8 and try again." };
  }
  if (!parsed.ok) return { error: parsed.error };

  return runImport({
    lead: `The file has ${plural(parsed.records.length, "row", "rows")}`,
    records: parsed.records,
    liftUtm: false,
    dryRun,
    notes: parsed.ignoredColumns.length > 0 ? [`Ignored columns: ${parsed.ignoredColumns.join(", ")}.`] : [],
  });
}

/* ---------- Galleries (link-in-bio pages) ---------- */

const MAX_UPLOAD_BYTES = 250_000;
const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type ImageResult = { ok: true; value: string | null } | { ok: false; error: string };

/** An image from an upload (stored as a small data URL), a pasted https URL, or the current value when neither is given. */
async function readImage(fd: FormData, field: string, current: string | null): Promise<ImageResult> {
  const file = fd.get(`${field}_file`);
  if (file instanceof File && file.size > 0) {
    if (!UPLOAD_TYPES.includes(file.type)) return { ok: false, error: "Upload a PNG, JPEG, WebP or GIF image." };
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That image is over 250 KB. Shrink it, or paste a link to an image hosted elsewhere." };
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    return { ok: true, value: `data:${file.type};base64,${data}` };
  }
  const url = text(fd, `${field}_url`);
  if (url) {
    const safe = safeImageSrc(url);
    if (!safe || !safe.startsWith("https:")) return { ok: false, error: "Image links must start with https://." };
    return { ok: true, value: safe };
  }
  if (fd.get(`${field}_remove`) === "on") return { ok: true, value: null };
  return { ok: true, value: current };
}

function galleryPaths(id: number) {
  revalidatePath("/admin/galleries");
  revalidatePath(`/admin/galleries/${id}`);
}

export async function createGalleryAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const domainId = Number(fd.get("domain_id"));
  if (!Number.isInteger(domainId) || domainId <= 0) return { error: "Choose a domain." };
  const title = text(fd, "title");
  if (!title) return { error: "Give the gallery a title." };
  if (title.length > 80) return { error: "Keep the title under 80 characters." };

  let slug: string;
  if (text(fd, "slug")) {
    const parsed = parseSlug(text(fd, "slug"));
    if (!parsed.ok) return { error: parsed.error };
    slug = parsed.value;
  } else {
    slug = randomSlug();
  }

  let id: number;
  try {
    id = await createGallery({ domainId, slug, title });
  } catch (e) {
    if (e instanceof SlugTakenError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/galleries");
  redirect(`/admin/galleries/${id}`);
}

export async function updateGalleryAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const gallery = Number.isInteger(id) ? await getGallery(id) : null;
  if (!gallery) return { error: "That gallery no longer exists." };

  const title = text(fd, "title");
  if (!title) return { error: "Give the gallery a title." };
  if (title.length > 80) return { error: "Keep the title under 80 characters." };
  const bio = text(fd, "bio");
  if (bio.length > 500) return { error: "Keep the bio under 500 characters." };
  const footer = text(fd, "footer");
  if (footer.length > 200) return { error: "Keep the footer under 200 characters." };

  const colours: Record<string, string> = {};
  for (const key of ["bg_color", "text_color", "button_color", "button_text_color"]) {
    const v = text(fd, key);
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return { error: "Colours must be six-digit hex values such as #004ba8." };
    colours[key] = hexColour(v, "#000000");
  }
  const style = text(fd, "button_style") as ButtonStyle;
  if (!BUTTON_STYLES.includes(style)) return { error: "Choose a button style." };

  const avatar = await readImage(fd, "avatar", gallery.avatar);
  if (!avatar.ok) return { error: avatar.error };

  await updateGallery(id, {
    title,
    bio: bio || null,
    avatar: avatar.value,
    bg_color: colours.bg_color,
    text_color: colours.text_color,
    button_color: colours.button_color,
    button_text_color: colours.button_text_color,
    button_style: style,
    footer: footer || null,
    published: fd.get("published") === "on",
  });
  galleryPaths(id);
  return { ok: "Saved." };
}

export async function deleteGalleryAction(fd: FormData) {
  await requireAdmin();
  await deleteGallery(Number(fd.get("id")));
  revalidatePath("/admin/galleries");
  redirect("/admin/galleries");
}

type ItemInput = { label: string | null; url: string | null; image: string | null; network: string | null };

/** Validates the fields that matter for an item's kind. */
async function readItem(kind: ItemKind, fd: FormData, currentImage: string | null): Promise<{ ok: true; value: ItemInput } | { ok: false; error: string }> {
  const label = text(fd, "label");
  const url = text(fd, "url");
  if (label.length > 120) return { ok: false, error: "Keep the label under 120 characters." };

  if (kind === "link") {
    if (!label) return { ok: false, error: "Give the button a label." };
    const safe = safeLinkUrl(url);
    if (!safe) return { ok: false, error: "The button needs a full web address, such as https://example.com." };
    return { ok: true, value: { label, url: safe, image: null, network: null } };
  }
  if (kind === "social") {
    const network = text(fd, "network");
    if (!(NETWORKS as readonly string[]).includes(network)) return { ok: false, error: "Choose a network." };
    const safe = safeLinkUrl(url);
    if (!safe) return { ok: false, error: "Enter the profile address (https://...) or, for email, the address itself." };
    return { ok: true, value: { label: null, url: safe, image: null, network } };
  }
  if (kind === "image") {
    const img = await readImage(fd, "image", currentImage);
    if (!img.ok) return { ok: false, error: img.error };
    if (!img.value) return { ok: false, error: "Upload an image or paste a link to one." };
    let target: string | null = null;
    if (url) {
      target = safeLinkUrl(url);
      if (!target) return { ok: false, error: "The link on the image must be a full web address." };
    }
    return { ok: true, value: { label: label || null, url: target, image: img.value, network: null } };
  }
  // video
  if (!youtubeId(url)) return { ok: false, error: "Paste a YouTube link, such as https://www.youtube.com/watch?v=..." };
  return { ok: true, value: { label: label || null, url, image: null, network: null } };
}

export async function addItemAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const galleryId = Number(fd.get("gallery_id"));
  if (!Number.isInteger(galleryId) || !(await getGallery(galleryId))) return { error: "That gallery no longer exists." };
  const kind = text(fd, "kind") as ItemKind;
  if (!["link", "social", "image", "video"].includes(kind)) return { error: "Choose what to add." };

  const item = await readItem(kind, fd, null);
  if (!item.ok) return { error: item.error };
  await addItem(galleryId, { kind, ...item.value });
  galleryPaths(galleryId);
  return { ok: "Added." };
}

export async function updateItemAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const existing = Number.isInteger(id) ? await getItem(id) : null;
  if (!existing) return { error: "That item no longer exists." };

  const item = await readItem(existing.kind, fd, existing.image);
  if (!item.ok) return { error: item.error };
  await updateItem(id, item.value);
  galleryPaths(existing.gallery_id);
  return { ok: "Saved." };
}

async function withItem(fd: FormData, fn: (id: number) => Promise<void>) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const item = Number.isInteger(id) ? await getItem(id) : null;
  if (!item) return;
  await fn(id);
  galleryPaths(item.gallery_id);
}

export async function moveItemAction(fd: FormData) {
  await withItem(fd, (id) => moveItem(id, fd.get("direction") === "up" ? -1 : 1));
}

export async function toggleItemAction(fd: FormData) {
  await withItem(fd, async (id) => setItemHidden(id, fd.get("hide") === "1"));
}

export async function deleteItemAction(fd: FormData) {
  await withItem(fd, deleteItem);
}
