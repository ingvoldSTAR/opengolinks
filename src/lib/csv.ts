import { stripNul, type ImportRecord } from "./import";
import { UTM_KEYS } from "./utm";

/** Limits for a CSV import. The file is read into memory, so both are enforced before any work is done. */
export const CSV_MAX_BYTES = 1_000_000;
export const CSV_MAX_ROWS = 20_000;

export const CSV_REQUIRED = ["domain", "slug", "destination"] as const;
const CSV_OPTIONAL = ["title", ...UTM_KEYS] as const;
const KNOWN = new Set<string>([...CSV_REQUIRED, ...CSV_OPTIONAL]);

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Splits CSV text into rows of cells (RFC 4180: quoted cells may hold delimiters, quotes written as "" and
 * line breaks). A quote only opens a cell when it comes first; one in the middle of a cell is kept as text.
 * Blank lines are kept as rows, so a row's position matches the row number a spreadsheet shows.
 */
export function parseCsv(text: string, delimiter: string): Result<{ rows: string[][] }> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let atCellStart = true;
  let openedOnLine = 1;
  let line = 1;

  const endCell = () => {
    row.push(cell);
    cell = "";
    atCellStart = true;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === "\n") line++;
        cell += c;
      }
    } else if (c === '"' && atCellStart) {
      inQuotes = true;
      atCellStart = false;
      openedOnLine = line;
    } else if (c === delimiter) {
      endCell();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endCell();
      rows.push(row);
      row = [];
      line++;
      if (rows.length > CSV_MAX_ROWS + 1) return { ok: false, error: tooManyRows() };
    } else {
      cell += c;
      atCellStart = false;
    }
  }
  if (inQuotes) return { ok: false, error: `The quote that opens on line ${openedOnLine} is never closed.` };
  if (cell !== "" || row.length > 0) {
    endCell();
    rows.push(row);
  }
  if (rows.length > CSV_MAX_ROWS + 1) return { ok: false, error: tooManyRows() };
  return { ok: true, rows };
}

const tooManyRows = () =>
  `That file has more than ${CSV_MAX_ROWS.toLocaleString("en-GB")} rows. Split it into smaller files and import them one at a time.`;

/** A column name as typed in a spreadsheet: "UTM Source" and "utm-source" both mean utm_source. */
const columnName = (raw: string) => raw.trim().toLowerCase().replace(/[\s-]+/g, "_");

/**
 * Reads CSV text into import records. The first row names the columns: domain, slug and destination are
 * required; title and the five utm_ columns are optional; anything else is ignored and reported.
 */
export function csvRecords(input: string): Result<{ records: ImportRecord[]; ignoredColumns: string[] }> {
  const text = stripNul(input).replace(/^﻿/, "");
  if (!text.trim()) return { ok: false, error: "The file is empty." };

  // Spreadsheets in many locales save with semicolons. Decide from the first line.
  const firstLine = text.slice(0, text.search(/[\r\n]|$/));
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const parsed = parseCsv(text, delimiter);
  if (!parsed.ok) return parsed;
  const [headerRow, ...dataRows] = parsed.rows;

  const header = headerRow.map(columnName);
  const missing = CSV_REQUIRED.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `The first row must name the columns, and these are missing: ${missing.join(", ")}. Found: ${header.filter(Boolean).join(", ") || "nothing"}.`,
    };
  }
  const duplicate = header.find((name, i) => name && header.indexOf(name) !== i);
  if (duplicate) return { ok: false, error: `The column "${duplicate}" appears more than once.` };

  const index = new Map(header.map((name, i) => [name, i]));
  const ignoredColumns = header.filter((name) => name && !KNOWN.has(name));

  const records: ImportRecord[] = [];
  dataRows.forEach((cells, n) => {
    if (cells.every((cell) => cell.trim() === "")) return; // a blank row
    const rowNumber = n + 2; // the header is row 1
    const get = (name: string) => (cells[index.get(name) ?? -1] ?? "").trim();
    records.push({
      host: get("domain"),
      slug: get("slug"),
      destination: get("destination"),
      title: get("title") || null,
      createdAt: null,
      note: `Imported from a CSV file (row ${rowNumber}).`,
      utm: Object.fromEntries(UTM_KEYS.map((k) => [k, get(k) || null])),
      ref: `row ${rowNumber}`,
    });
  });
  if (records.length === 0) return { ok: false, error: "The file has a header row but no links below it." };
  return { ok: true, records, ignoredColumns };
}
