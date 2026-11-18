// Runs once when the server starts, before it serves requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { checkConfig } = await import("./lib/config");
  checkConfig();
}
