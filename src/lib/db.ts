import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

let database: DatabaseSync | undefined;

/** Local-only SQLite connection. No secrets are logged and the path is configurable by environment. */
export function getDatabase() {
  if (database) return database;
  const configuredPath = process.env.DATABASE_PATH ?? "./data/radar.sqlite";
  const dbPath = path.resolve(configuredPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  database = new DatabaseSync(dbPath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const migrations = path.resolve("db/migrations");
  for (const name of fs.readdirSync(migrations).filter((entry) => /^\d+_.*\.sql$/.test(entry)).sort()) {
    if (database.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get(name)) continue;
    const sql = fs.readFileSync(path.join(migrations, name), "utf8");
    database.exec("BEGIN");
    try {
      database.exec(sql);
      database.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(name, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
  }
  return database;
}

export function closeDatabase() { database?.close(); database = undefined; }
