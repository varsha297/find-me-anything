import { EmbeddingService } from "../embeddings/embedding-service.js";

import { OpenAIEmbeddingProvider } from "../embeddings/openai-embedding-provider.js";

import { openaiClient } from "../embeddings/openai-client.js";

import { databasePool } from "../database/pool.js";

import { DocumentChunkRepository } from "../repositories/document-chunk.repository.js";

async function main(): Promise<void> {
  const documentId = process.argv
    .slice(2)
    .find((argument) => argument !== "--")
    ?.trim();
  if (!documentId) {
    throw new Error(
      [
        "Document ID is required.",
        "Usage:",
        "verify:store-embeddings <document-id>",
      ].join(" "),
    );
  }

  const chunkRepository = new DocumentChunkRepository(databasePool);

  const provider = new OpenAIEmbeddingProvider(openaiClient);

  const embeddingService = new EmbeddingService(provider, chunkRepository);

  console.log("Embedding document.", {
    documentId,
  });

  const totalEmbedded = await embeddingService.embedDocument(documentId);

  console.log("Embedding completed.", {
    documentId,
    totalEmbedded,
    model: provider.model,
    dimensions: provider.dimensions,
  });
}

main()
  .catch((error: unknown) => {
    console.error("Embedding storage verification failed.", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await databasePool.end();
  });
