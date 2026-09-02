/** Operator attestation after provider preflight; this never discovers or proves a target. */
/** @param {Record<string, string | undefined>} environment */
export function assertStagingQaAuthority(environment = process.env) {
  const ref = environment.QA_VERIFIED_STAGING_PROJECT_REF
  if (environment.APP_ENVIRONMENT !== "staging" || environment.QA_ALLOW_STAGING_WRITES !== "true" ||
      !/^[a-z]{20}$/.test(ref ?? "") ||
      environment.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) {
    throw new Error("DB QA blocked: verify the staging project with dautia-supabase, then explicitly attest its ref and authorize isolated fixture writes. Local/production DBs are forbidden. Use test:local or test:browser:local without DB.")
  }
}
