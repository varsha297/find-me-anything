import { app } from "./app.ts";
import { env } from "./config/env.ts";
import { checkDatabaseConnection, closeDatabasePool } from "./database/pool.ts";

async function startServer(): Promise<void> {
  await checkDatabaseConnection();

  const server = app.listen(env.PORT, () => {
    console.log(`API running at http://localhost:${env.PORT}`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`${signal} received. Shutting down...`);

    server.close(async (serverError) => {
      if (serverError) {
        console.error("Failed to close HTTP server:", serverError);

        process.exitCode = 1;
      }

      try {
        await closeDatabasePool();
      } catch (databaseError) {
        console.error("Failed to close PostgreSQL pool:", databaseError);

        process.exitCode = 1;
      }

      process.exit();
    });
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

startServer().catch((error: unknown) => {
  console.error("Failed to start API:", error);
  process.exit(1);
});
