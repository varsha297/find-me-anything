import type OpenAI from "openai";

import type {
  EmbeddingProvider,
  EmbeddingResult,
} from "./embedding-provider.js";

export const EMBEDDING_MODEL = "text-embedding-3-small";

export const EMBEDDING_DIMENSIONS = 1536;

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model = EMBEDDING_MODEL;

  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(private readonly client: OpenAI) {}

  async embedTexts(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
      encoding_format: "float",
    });

    const embeddings = [...response.data].sort((a, b) => a.index - b.index);

    if (embeddings.length !== texts.length) {
      throw new Error(
        [
          "Embedding count mismatch.",
          `Expected ${texts.length}.`,
          `Received ${embeddings.length}.`,
        ].join(" "),
      );
    }

    return embeddings.map((item) => {
      if (item.embedding.length !== this.dimensions) {
        throw new Error(
          [
            "Embedding dimension mismatch.",
            `Expected ${this.dimensions}.`,
            `Received ${item.embedding.length}.`,
          ].join(" "),
        );
      }

      return {
        embedding: item.embedding,
      };
    });
  }
}
