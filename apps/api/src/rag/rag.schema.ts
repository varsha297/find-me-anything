import { z } from "zod";

export const askRequestSchema = z.object({
  question: z.string().trim().min(2).max(2_000),

  documentId: z.string().uuid().optional(),
});

export type AskRequest = z.infer<typeof askRequestSchema>;
