export const useCsrfToken = () => ({ csrfToken: "local-only" })
export const env = { WHATSAPP_NUMBER: () => "" }
export async function postVideoProgressFlush() {}
export function sendVideoProgressFlushBeacon() { return true }
export function registerActiveVideoProgressFlushHandler() { return () => {} }
