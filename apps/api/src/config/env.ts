import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  AWS_REGION: z.string().min(1, "AWS_REGION is required"),

  S3_BUCKET_NAME: z.string().min(3, "S3_BUCKET_NAME is required"),

  AWS_PROFILE: z.string().min(1).optional(),

  UPLOAD_SESSION_EXPIRES_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(900)
    .default(600),

  MAX_UPLOAD_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),

  MAX_FILES_PER_BATCH: z.coerce.number().int().min(2).max(50).default(10),

  MAX_BATCH_UPLOAD_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * 1024 * 1024),

  LOCAL_DEV_USER_ID: z.string().uuid("LOCAL_DEV_USER_ID must be a valid UUID"),
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
