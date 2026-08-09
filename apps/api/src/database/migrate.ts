import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { PoolClient } from "pg";

import { pool } from "./pool.js";

type AppliedMigrationRow = {
  filename: string;
  checksum: string;
};

const migrationsDirectory = fileURLToPath(
  new URL("../../../../packages/database/migrations/", import.meta.url),
);

const MIGRATION_LOCK_NAME = "findanything-database-migrations";

function createChecksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(
  client: PoolClient,
): Promise<Map<string, string>> {
  const result = await client.query<AppliedMigrationRow>(`
      SELECT
        filename,
        checksum
      FROM schema_migrations
      ORDER BY filename;
    `);

  return new Map(result.rows.map((row) => [row.filename, row.checksum]));
}

async function getMigrationFiles(): Promise<string[]> {
  const files = await readdir(migrationsDirectory);

  return files
    .filter((filename) => /^\d+[-_].+\.sql$/i.test(filename))
    .sort((first, second) => first.localeCompare(second));
}

async function applyMigration(
  client: PoolClient,
  filename: string,
  sql: string,
  checksum: string,
): Promise<void> {
  console.log(`Applying migration: ${filename}`);

  try {
    await client.query("BEGIN");

    await client.query(sql);

    await client.query(
      `
        INSERT INTO schema_migrations (
          filename,
          checksum
        )
        VALUES ($1, $2);
      `,
      [filename, checksum],
    );

    await client.query("COMMIT");

    console.log(`Applied migration: ${filename}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(
      `
        SELECT pg_advisory_lock(
          hashtext($1)
        );
      `,
      [MIGRATION_LOCK_NAME],
    );

    await ensureMigrationTable(client);

    const appliedMigrations = await getAppliedMigrations(client);

    const migrationFiles = await getMigrationFiles();

    for (const filename of migrationFiles) {
      const migrationPath = `${migrationsDirectory}/${filename}`;

      const sql = await readFile(migrationPath, "utf8");

      const checksum = createChecksum(sql);

      const existingChecksum = appliedMigrations.get(filename);

      if (existingChecksum) {
        if (existingChecksum !== checksum) {
          throw new Error(
            `Migration "${filename}" was modified after it was applied. Create a new migration instead.`,
          );
        }

        console.log(`Skipping applied migration: ${filename}`);

        continue;
      }

      await applyMigration(client, filename, sql, checksum);
    }

    console.log("Database migrations completed.");
  } finally {
    try {
      await client.query(
        `
          SELECT pg_advisory_unlock(
            hashtext($1)
          );
        `,
        [MIGRATION_LOCK_NAME],
      );
    } finally {
      client.release();
      await pool.end();
    }
  }
}

runMigrations().catch((error: unknown) => {
  console.error("Database migration failed.", error);

  process.exitCode = 1;
});
