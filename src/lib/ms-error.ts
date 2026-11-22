// Turning Microsoft's error reply into a short reason that is safe to show to an admin. No imports from this app.

type MicrosoftError = { error?: unknown; error_description?: unknown };

/**
 * Microsoft's token endpoint says what is wrong in `error_description`, for example
 * "AADSTS7000215: Invalid client secret provided. Ensure the secret being sent in the request is the client
 * secret value, not the client secret ID, ...", followed by a trace ID, correlation ID and timestamp on later
 * lines. Only the first line is kept, trimmed. It never contains our secret (we never send it back to ourselves).
 */
export function describeMicrosoftError(data: MicrosoftError | null | undefined): string {
  const code = typeof data?.error === "string" ? data.error.slice(0, 60) : "";
  // The reason ends where the trace begins, whether Microsoft separates them with a line break or not.
  const text = typeof data?.error_description === "string" ? data.error_description.split(/\r?\n|\s*Trace ID:/i)[0].trim().slice(0, 240) : "";
  if (text && code) return `${code}, ${text}`;
  return text || code;
}
