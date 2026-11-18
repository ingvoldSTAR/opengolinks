import { headers } from "next/headers";
import { query } from "./db";

/**
 * Limit on password sign-in attempts, kept in the database so it holds across restarts and for
 * concurrent requests. Each attempt is counted BEFORE the password is looked at, in one atomic
 * statement, so a burst of parallel guesses cannot all slip through.
 *
 * Two fixed windows: one per client address, and one across everyone. The global one matters because
 * the address comes from a header the proxy may not control. The cost is that an attacker can use up
 * the global allowance and block the shared password for a while; GitHub sign-in is unaffected.
 */
const WINDOW_MINUTES = 15;
const PER_CLIENT = 5;
const GLOBAL = 40;
const GLOBAL_KEY = "global";

async function clientKey(): Promise<string> {
  const h = await headers();
  // The last X-Forwarded-For entry is the one the nearest proxy added.
  const forwarded = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = forwarded[forwarded.length - 1] || h.get("x-real-ip")?.trim() || "unknown";
  return `ip:${ip.slice(0, 64)}`;
}

/** Counts one attempt on `key`. Returns how many attempts the window holds now and when it ends. */
async function count(key: string): Promise<{ attempts: number; secondsLeft: number }> {
  const rows = await query<{ attempts: number; seconds_left: number }>(
    `insert into login_attempts (key, attempts, window_start) values ($1, 1, now())
     on conflict (key) do update set
       attempts     = case when login_attempts.window_start < now() - ($2::int * interval '1 minute')
                           then 1 else login_attempts.attempts + 1 end,
       window_start = case when login_attempts.window_start < now() - ($2::int * interval '1 minute')
                           then now() else login_attempts.window_start end
     returning attempts,
       greatest(0, ceil(extract(epoch from (window_start + ($2::int * interval '1 minute') - now()))))::int as seconds_left`,
    [key, WINDOW_MINUTES],
  );
  return { attempts: Number(rows[0].attempts), secondsLeft: Number(rows[0].seconds_left) };
}

export type LoginGate = { allowed: true; clientKey: string } | { allowed: false; message: string };

/** Call before checking a password. When `allowed` is false, do not look at the password at all. */
export async function startLoginAttempt(): Promise<LoginGate> {
  // Rows are tiny; this keeps addresses that stopped trying from piling up.
  await query("delete from login_attempts where window_start < now() - interval '1 day'");

  const key = await clientKey();
  const mine = await count(key);
  if (mine.attempts > PER_CLIENT) return { allowed: false, message: tooMany(mine.secondsLeft) };

  // Only attempts that got this far count against everyone, so one blocked client cannot use up the allowance.
  const all = await count(GLOBAL_KEY);
  if (all.attempts > GLOBAL) return { allowed: false, message: tooMany(all.secondsLeft) };

  return { allowed: true, clientKey: key };
}

/** A correct password clears this client's count and gives back the global attempt it used. */
export async function loginSucceeded(clientKey: string): Promise<void> {
  await query("delete from login_attempts where key = $1", [clientKey]);
  await query("update login_attempts set attempts = greatest(attempts - 1, 0) where key = $1", [GLOBAL_KEY]);
}

function tooMany(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many sign-in attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
