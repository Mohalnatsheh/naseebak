/**
 * Container start-up data step (local/staging only).
 * - Seeds demo data once (when the admin account is missing)
 * - Loads the sample blog posts when the blog is empty
 * - Applies the switches listed in ENABLE_SWITCHES (e.g. "intro_requests_enabled,chat_enabled,new_suggestions_flow")
 * - Runs the one-time new-cycle credit top-up when RUN_NEW_CYCLE_MIGRATION=true (runs once, marker-guarded)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: admins } = await client.query("SELECT 1 FROM users WHERE email = $1 LIMIT 1", ["admin@naseeb.jo"]);
if (admins.length === 0) {
  console.log("[init] seeding demo data");
  execFileSync("node", ["prisma/seed.mjs"], { stdio: "inherit" });
}

try {
  const { rows } = await client.query("SELECT count(*)::int AS n FROM blog_posts");
  if (rows[0].n === 0 && fs.existsSync("prisma/seed-blog.sql")) {
    await client.query(fs.readFileSync("prisma/seed-blog.sql", "utf-8"));
    console.log("[init] loaded sample blog posts");
  }
} catch (err) {
  console.warn("[init] blog seed skipped:", err.message);
}

const switches = (process.env.ENABLE_SWITCHES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
for (const key of switches) {
  await client.query(
    `INSERT INTO system_settings (key, value, "updatedAt", "createdAt") VALUES ($1, 'true', now(), now())
     ON CONFLICT (key) DO UPDATE SET value = 'true', "updatedAt" = now()`,
    [key]
  );
}
if (switches.length) console.log("[init] switches on:", switches.join(", "));
await client.end();

if (process.env.RUN_NEW_CYCLE_MIGRATION === "true") {
  execFileSync("node", ["scripts/new-cycle-migrate.mjs"], { stdio: "inherit" });
}
