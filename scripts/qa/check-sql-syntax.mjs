import { readFile, readdir } from "node:fs/promises"
import { parse } from "pgsql-parser"
import { parsePlPgSQL } from "libpg-query"
const directory = new URL("../../supabase/migrations/", import.meta.url)
const files = (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()
let statements = 0
let functions = 0
for (const name of files) {
  const sql = await readFile(new URL(name, directory), "utf8")
  try {
    const parsed = await parse(sql)
    statements += parsed.stmts?.length ?? 0
    const bodies = await parsePlPgSQL(sql)
    functions += bodies.plpgsql_funcs?.length ?? 0
  } catch (error) {
    console.error("SQL syntax failed:", name, error.message)
    process.exitCode = 1
  }
}
if (!process.exitCode) console.log(`SQL syntax: ${files.length} migrations / ${statements} statements / ${functions} function bodies parsed. No database used; does not validate objects, grants, query plans or runtime semantics.`)
