import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

const EMBEDDING_DIMENSIONS = 1536;

export class QueryEmbeddingService {
  constructor(private readonly client: OpenAI) {}

  get model(): string {
    return EMBEDDING_MODEL;
  }

  async embedQuery(query: string): Promise<number[]> {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      throw new Error("Search query cannot be empty.");
    }

    const response = await this.client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: normalizedQuery,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    });

    const result = response.data[0];

    if (!result) {
      throw new Error("Embedding model returned no query embedding.");
    }

    if (result.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        [
          "Query embedding dimension mismatch.",
          `Expected ${EMBEDDING_DIMENSIONS}.`,
          `Received ${result.embedding.length}.`,
        ].join(" "),
      );
    }

    return result.embedding;
  }
}
