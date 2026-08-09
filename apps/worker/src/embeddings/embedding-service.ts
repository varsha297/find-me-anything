import type { EmbeddingProvider } from "./embedding-provider.js";

import type { DocumentChunkRepository } from "../repositories/document-chunk.repository.js";

const DEFAULT_BATCH_SIZE = 50;

export class EmbeddingService {
  constructor(
    private readonly provider: EmbeddingProvider,

    private readonly chunkRepository: DocumentChunkRepository,

    private readonly batchSize = DEFAULT_BATCH_SIZE,
  ) {}

  async embedDocument(documentId: string): Promise<number> {
    let totalEmbedded = 0;

    while (true) {
      const chunks = await this.chunkRepository.findWithoutEmbeddings(
        documentId,
        this.batchSize,
      );

      if (chunks.length === 0) {
        break;
      }

      console.log("Generating embeddings.", {
        documentId,
        batchSize: chunks.length,
        totalEmbedded,
      });

      const results = await this.provider.embedTexts(
        chunks.map((chunk) => chunk.content),
      );

      if (results.length !== chunks.length) {
        throw new Error("Embedding result count does not match chunk count.");
      }

      await this.chunkRepository.saveEmbeddings({
        model: this.provider.model,

        items: chunks.map((chunk, index) => {
          const result = results[index];

          if (!result) {
            throw new Error(`Missing embedding for chunk ${chunk.id}.`);
          }

          return {
            chunkId: chunk.id,

            embedding: result.embedding,
          };
        }),
      });

      totalEmbedded += chunks.length;
    }

    return totalEmbedded;
  }
}
