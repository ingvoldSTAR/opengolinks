import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA_SQL } from "./schema";

type Row = Record<string, unknown>;

interface Driver {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  /** Runs the schema script once, under a database lock, and records which script version was applied. */
  migrate(sql: string, version: string): Promise<void>;
}

/** An arbitrary number that names the schema lock. Every copy of the app uses the same one. */
const SCHEMA_LOCK_ID = 727301;

const VERSION_TABLE_SQL = "create table if not exists schema_version (id int primary key, hash text not null)";
const RECORD_VERSION_SQL = "insert into schema_version (id, hash) values (1, $1) on conflict (id) do update set hash = excluded.hash";

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
      async migrate(sql: string, version: string) {
        // The host can start several copies of the app at once. Without the lock they all run the same
        // schema changes together and Postgres aborts one with "deadlock detected". The lock is taken
        // inside a transaction, so it also works through a pooled connection string.
        const client = await pool.connect();
        try {
          await client.query("begin");
          await client.query("select pg_advisory_xact_lock($1)", [SCHEMA_LOCK_ID]);
          await client.query(VERSION_TABLE_SQL);
          // Another copy may have finished the work while this one waited for the lock.
          const done = await client.query("select 1 from schema_version where id = 1 and hash = $1", [version]);
          if (done.rowCount === 0) {
            await client.query(sql);
            await client.query(RECORD_VERSION_SQL, [version]);
          }
          await client.query("commit");
        } catch (err) {
          await client.query("rollback").catch(() => {});
          throw err;
        } finally {
          client.release();
        }
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
    async migrate(sql: string, version: string) {
      // One process owns the embedded database, so there is nothing to lock against.
      await db.exec(VERSION_TABLE_SQL);
      const done = await db.query("select 1 from schema_version where id = 1 and hash = $1", [version]);
      if (done.rows.length === 0) {
        await db.exec(sql);
        await db.query(RECORD_VERSION_SQL, [version]);
      }
    },
  };
}

const SCHEMA_VERSION = createHash("sha256").update(SCHEMA_SQL).digest("hex");

/**
 * Brings the schema up to date, but only when it is not already. Doing the full script on every start
 * made the first visitor after each restart wait for it, and let simultaneous starts collide.
 */
async function ensureSchema(driver: Driver): Promise<void> {
  try {
    const rows = await driver.query<{ hash: string }>("select hash from schema_version where id = 1");
    if (rows[0]?.hash === SCHEMA_VERSION) return;
  } catch {
    // No version table yet (first run, or a database from before this check): fall through and migrate.
  }
  await driver.migrate(SCHEMA_SQL, SCHEMA_VERSION);
}

async function init(): Promise<Driver> {
  const driver = await createDriver();
  await ensureSchema(driver);
  // Accounts listed in ADMIN_EMAILS are created if missing, and are always admins. Removing one here does not delete it.
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails) {
    await driver.query(
      "insert into users (email, role) select $1::text, 'admin' where not exists (select 1 from users where lower(email) = $1::text)",
      [email],
    );
    await driver.query("update users set role = 'admin' where lower(email) = $1::text and role <> 'admin'", [email]);
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
