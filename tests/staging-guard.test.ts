import { describe, expect, it } from "vitest"
import { assertStagingQaAuthority } from "../scripts/qa/staging-guard.mjs"
const fixture = { APP_ENVIRONMENT: "staging", QA_ALLOW_STAGING_WRITES: "true", QA_VERIFIED_STAGING_PROJECT_REF: "abcdefghijklmnopqrst", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }
describe("staging-only database QA guard", () => {
  it("accepts explicit matching staging attestation", () => expect(() => assertStagingQaAuthority(fixture)).not.toThrow())
  it.each([{}, { ...fixture, APP_ENVIRONMENT: "production" }, { ...fixture, QA_ALLOW_STAGING_WRITES: "" }, { ...fixture, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }, { ...fixture, NEXT_PUBLIC_SUPABASE_URL: "https://another-project.supabase.co" }])("blocks absent or inconsistent authority %j", input => expect(() => assertStagingQaAuthority(input)).toThrow("DB QA blocked"))
})
