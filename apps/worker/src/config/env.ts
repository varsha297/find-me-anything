import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { z } from "zod";

const envFilePath = fileURLToPath(new URL("../../.env", import.meta.url));

config({
  path: envFilePath,
});

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  AWS_REGION: z.string().min(1),

  AWS_PROFILE: z.string().min(1).optional(),

  SQS_QUEUE_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),

  WORKER_ENABLED: booleanString.default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid worker environment variables:",
    parsed.error.flatten().fieldErrors,
  );

  throw new Error("Worker environment configuration is invalid.");
}

export const env = parsed.data;
