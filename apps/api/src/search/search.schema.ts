import { z } from "zod";

export const searchRequestSchema = z.object({
  query: z.string().trim().min(2).max(2_000),

  limit: z.number().int().min(1).max(20).default(5),

  documentId: z.string().uuid().optional(),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
