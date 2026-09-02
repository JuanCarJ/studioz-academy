/* eslint-disable @typescript-eslint/no-require-imports -- Node preload must be CommonJS before app modules load. */
// Preloaded ONLY by local QA/build scripts. Never imported by the app.
const allowed = new Set(["127.0.0.1", "localhost", "::1", "fonts.googleapis.com", "fonts.gstatic.com"])
function assertAllowed(input) {
  let hostname
  try { hostname = new URL(typeof input === "string" || input instanceof URL ? input : input.url).hostname }
  catch { hostname = input?.hostname ?? input?.host }
  if (!allowed.has(hostname)) throw new Error("Provider network is disabled during local verification")
}
const originalFetch = globalThis.fetch
globalThis.fetch = (input, options) => {
  assertAllowed(input)
  return originalFetch(input, options)
}
for (const protocol of ["node:http", "node:https"]) {
  const mod = require(protocol)
  for (const name of ["request", "get"]) {
    const original = mod[name]
    mod[name] = function(input, ...args) { assertAllowed(input); return original.call(this, input, ...args) }
  }
}
