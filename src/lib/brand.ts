/**
 * The name shown in the admin, in invitation emails and to AI agents. Set APP_NAME to rename the app without touching
 * the code (the default is "opengolinks"). APP_SLUG is the same name as a lower-case identifier, used as the server
 * name in MCP client configuration.
 */
export const APP_NAME = process.env.APP_NAME?.trim() || "opengolinks";
export const APP_SLUG = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "opengolinks";
