const appUrl = process.env.NEXT_PUBLIC_APP_URL
const bypassSecret =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
  process.env.VERCEL_PROTECTION_BYPASS_SECRET ||
  ""

if (!appUrl) {
  console.error("Missing NEXT_PUBLIC_APP_URL")
  process.exit(1)
}

const webhookUrl = new URL("/api/webhooks/wompi", appUrl)

if (bypassSecret) {
  webhookUrl.searchParams.set("x-vercel-protection-bypass", bypassSecret)
}

console.log(webhookUrl.toString())
