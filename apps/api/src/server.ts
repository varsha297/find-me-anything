import { app } from "./app.js";
import { env } from "./config/env.js";
import { database } from "./database/client.js";

const server = app.listen(env.PORT, () => {
  console.log(`AgentOps API listening on http://localhost:${env.PORT}`);
});

const shutdown = (signal: string): void => {
  console.log(`${signal} received. Shutting down...`);

  server.close(() => {
    void database
      .end()
      .then(() => {
        console.log("Database connections closed");
        process.exit(0);
      })
      .catch((error: unknown) => {
        console.error("Shutdown failed:", error);
        process.exit(1);
      });
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
