import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA_SQL } from "./schema";

type Row = Record<string, unknown>;

interface Driver {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
}

const g = globalThis as unknown as { __opengolinksDriver?: Promise<Driver> };

/** Env values pasted from a .env file often keep their surrounding quotes or whitespace. */
function cleanEnv(value: string | undefined): string {
  return (value ?? "").trim().replace(/^(["'])(.*)\1$/s, "$2").trim();
}

/** A pooled connection string (DATABASE_URL_POOLED) wins over DATABASE_URL when both are set. Never include the string in an error. */
function databaseUrl(): string | null {
  const url = cleanEnv(process.env.DATABASE_URL_POOLED) || cleanEnv(process.env.DATABASE_URL);
  if (!url) return null;
  try {
    new URL(url);
  } catch {
    throw new Error(
      "The database connection string is not a valid URL. Check DATABASE_URL (or DATABASE_URL_POOLED): it should start with postgresql:// and contain no spaces.",
    );
  }
  return url;
}

async function createDriver(): Promise<Driver> {
  const url = databaseUrl();

  if (url) {
    const { Pool } = await import("pg");
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    // Certificates are verified. If the connection string carries sslmode, that wins (use
    // sslmode=no-verify for a server with a self-signed certificate); otherwise TLS is required for remote hosts.
    const pool = new Pool({
      connectionString: url,
      max: 3,
      // A database that scales to zero needs a moment to wake up; do not fail the first request.
      connectionTimeoutMillis: 10_000,
      ssl: parsed.searchParams.has("sslmode") ? undefined : !local,
    });
    // An error on an idle client is emitted on the pool; unhandled, it crashes the process.
    pool.on("error", (err) => {
      console.error("[db] idle client error:", err.message);
    });
    return {
      async query<T = Row>(text: string, params: unknown[] = []) {
        const res = await pool.query(text, params);
        return res.rows as T[];
      },
      async exec(text: string) {
        await pool.query(text);
      },
    };
  }

  // In production an embedded database on local disk can be wiped by a redeploy, so a
  // missing DATABASE_URL must fail loudly. Setting PGLITE_DIR is an explicit opt-in,
  // e.g. for trying a production build locally.
  if (process.env.NODE_ENV === "production" && !process.env.PGLITE_DIR) {
    throw new Error("DATABASE_URL is not set. Set it in the environment.");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  return {
    async query<T = Row>(text: string, params: unknown[] = []) {
      const res = await db.query(text, params);
      return res.rows as T[];
    },
    async exec(text: string) {
      await db.exec(text);
    },
  };
}

async function init(): Promise<Driver> {
  const driver = await createDriver();
  await driver.exec(SCHEMA_SQL);
  // Accounts listed in ADMIN_EMAILS are created if missing. Removing one here does not delete it.
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails) {
    await driver.query(
      "insert into users (email) select $1::text where not exists (select 1 from users where lower(email) = $1::text)",
      [email],
    );
  }
  return driver;
}

function getDriver(): Promise<Driver> {
  if (!g.__opengolinksDriver) {
    g.__opengolinksDriver = init().catch((err) => {
      // Shows up in the host's runtime logs, which is where a production 500 has to be diagnosed.
      console.error("[db] setup failed:", err instanceof Error ? err.message : err);
      g.__opengolinksDriver = undefined;
      throw err;
    });
  }
  return g.__opengolinksDriver;
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const driver = await getDriver();
  return driver.query<T>(text, params);
}
