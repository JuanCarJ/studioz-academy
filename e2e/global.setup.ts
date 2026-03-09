import { ensureBusinessFixtures } from "./support/db"

export default async function globalSetup() {
  await ensureBusinessFixtures()
}

