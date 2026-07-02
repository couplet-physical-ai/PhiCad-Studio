import { Kysely, SqliteDialect, PostgresDialect } from "kysely";
import { Database as BunSqliteDatabase } from "bun:sqlite";
import { join } from "path";
import { mkdir } from "fs/promises";
import type { Database as DatabaseSchema } from "./types.ts";
import type { Config } from "../config.ts";

/**
 * Adapter wrapping bun:sqlite to match the better-sqlite3 API that Kysely's SqliteDialect expects.
 *
 * Kysely's SqliteConnection calls:
 *   - db.prepare(sql) → Statement
 *   - statement.reader → boolean (true = SELECT-like)
 *   - statement.all(parameters) → rows[]
 *   - statement.run(parameters) → { changes, lastInsertRowid }
 *   - db.close()
 *
 * bun:sqlite differences:
 *   - No `reader` property on Statement
 *   - `run()` already returns { changes, lastInsertRowid } ✓
 *   - Parameters passed as array to `.all([...])` and `.run([...])` work ✓
 */
function createBetterSqlite3Compatible(dbPath: string) {
  const db = new BunSqliteDatabase(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      const isReader = isSelectStatement(sql);

      return {
        reader: isReader,
        all(parameters: any[]) {
          return stmt.all(...parameters);
        },
        run(parameters: any[]) {
          return stmt.run(...parameters);
        },
        get(parameters: any[]) {
          return stmt.get(...parameters);
        },
        columns() {
          return stmt.columnNames.map((name: string) => ({ name }));
        },
      };
    },
    close() {
      db.close();
    },
    transaction(fn: Function) {
      return db.transaction(fn as any);
    },
  };
}

function isSelectStatement(sql: string): boolean {
  const trimmed = sql.trimStart().toUpperCase();
  return (
    trimmed.startsWith("SELECT") ||
    trimmed.startsWith("WITH") ||
    trimmed.startsWith("PRAGMA") ||
    trimmed.startsWith("EXPLAIN")
  );
}

export async function createDatabase(config: Config): Promise<Kysely<DatabaseSchema>> {
  if (config.databaseUrl) {
    // Postgres - pg must be installed: bun add pg
    const pg = await import("pg" as string);
    const Pool = pg.default?.Pool ?? pg.Pool;
    const dialect = new PostgresDialect({
      pool: new Pool({ connectionString: config.databaseUrl }),
    });
    return new Kysely<DatabaseSchema>({ dialect });
  }

  // SQLite via bun:sqlite with better-sqlite3-compatible wrapper
  const dbDir = config.dataDir;
  await mkdir(dbDir, { recursive: true });
  const dbPath = join(dbDir, "onemind.db");

  const database = createBetterSqlite3Compatible(dbPath);
  const dialect = new SqliteDialect({ database: database as any });
  return new Kysely<DatabaseSchema>({ dialect });
}
