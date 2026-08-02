import { Pool } from "pg";

import { env } from "../config/env.ts";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,

  // Maximum simultaneous PostgreSQL connections
  // opened by this API process.
  max: 10,

  // Close an unused connection after 30 seconds.
  idleTimeoutMillis: 30_000,

  // Fail quickly when PostgreSQL cannot be reached.
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL connection-pool error:", error);
});

export async function checkDatabaseConnection(): Promise<void> {
  const result = await pool.query<{
    current_database: string;
    current_user: string;
    current_time: Date;
  }>(
    `
      SELECT
        current_database(),
        current_user,
        NOW() AS current_time
    `,
  );

  const database = result.rows[0];

  if (!database) {
    throw new Error("PostgreSQL connection check returned no result");
  }

  console.log("PostgreSQL connected", {
    database: database.current_database,
    user: database.current_user,
    time: database.current_time,
  });
}

export async function closeDatabasePool(): Promise<void> {
  await pool.end();
  console.log("PostgreSQL connection pool closed");
}
