import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  console.error(
    "Invalid environment configuration:",
    result.error.flatten().fieldErrors,
  );

  throw new Error("Invalid environment configuration");
}

export const env = result.data;
