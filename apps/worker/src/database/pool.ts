import { Pool } from "pg";

import { env } from "../config/env.js";

export const databasePool = new Pool({
  connectionString: env.DATABASE_URL,

  /*
   * A worker does not need a large connection pool.
   * Start small and increase it only when worker
   * concurrency is intentionally increased.
   */
  max: 5,

  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

databasePool.on("error", (error: Error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

export async function verifyDatabaseConnection(): Promise<void> {
  const result = await databasePool.query<{
    current_database: string;
    current_time: Date;
  }>(
    `
      SELECT
        current_database(),
        NOW() AS current_time
    `,
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("PostgreSQL connection test returned no result.");
  }

  console.log("PostgreSQL connection established.", {
    database: row.current_database,
    time: row.current_time,
  });
}
