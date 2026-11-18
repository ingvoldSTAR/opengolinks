/** Minimum lengths enforced in production. */
export const MIN_ADMIN_PASSWORD = 12;
export const MIN_SESSION_SECRET = 32;

const isProduction = () => process.env.NODE_ENV === "production";

/** Settings that make a deployment unsafe or broken. Never includes the values themselves. */
export function configProblems(): string[] {
  const problems: string[] = [];
  const password = process.env.ADMIN_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? "";
  if (password.length < MIN_ADMIN_PASSWORD) {
    problems.push(`ADMIN_PASSWORD must be set and at least ${MIN_ADMIN_PASSWORD} characters long.`);
  }
  if (secret.length < MIN_SESSION_SECRET) {
    problems.push(`SESSION_SECRET must be set and at least ${MIN_SESSION_SECRET} characters long (for example the output of: openssl rand -hex 32).`);
  }
  return problems;
}

/**
 * Called once when the server starts (see instrumentation.ts). Production refuses to start on a bad
 * configuration: it prints the problems and exits, rather than leaving a server that answers every request with an error.
 */
export function checkConfig(): void {
  const problems = configProblems();
  if (isProduction()) {
    if (problems.length > 0) {
      console.error(`Refusing to start in production:\n- ${problems.join("\n- ")}`);
      process.exit(1);
    }
    if (!(process.env.ADMIN_HOSTS ?? "").trim()) {
      console.warn("[config] ADMIN_HOSTS is not set, so /admin answers 404 on every host. Set it to the host that should serve the admin area.");
    }
    return;
  }
  for (const problem of problems) {
    console.warn(`[config] Development mode, would be refused in production: ${problem}`);
  }
}
