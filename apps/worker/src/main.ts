import { s3Client } from "./aws/s3-client.js";
import { sqsClient } from "./aws/sqs-client.js";
import { documentChunker } from "./chunking/chunker.js";
import { env } from "./config/env.js";
import { databasePool } from "./database/pool.js";
import { documentExtractorRegistry } from "./extraction/extractor-registry.js";
import { DocumentEventProcessorImpl } from "./processors/document-event.processor.js";
import { SqsConsumer } from "./queue/sqs-consumer.js";
import { DocumentChunkRepository } from "./repositories/document-chunk.repository.js";
import { DocumentRepository } from "./repositories/document.repository.js";
import { DownloadS3ObjectService } from "./storage/download-s3-object.service.js";
import { EmbeddingService } from "./embeddings/embedding-service.js";

import { OpenAIEmbeddingProvider } from "./embeddings/openai-embedding-provider.js";

import { openaiClient } from "./embeddings/openai-client.js";
async function main(): Promise<void> {
  if (!env.WORKER_ENABLED) {
    console.log("Worker is configured correctly but disabled.");

    return;
  }

  const abortController = new AbortController();

  const shutdown = (signalName: string): void => {
    console.log(`Received ${signalName}. Shutting down.`);

    abortController.abort();
  };

  process.once("SIGINT", () => shutdown("SIGINT"));

  process.once("SIGTERM", () => shutdown("SIGTERM"));

  const documentRepository = new DocumentRepository(databasePool);

  const chunkRepository = new DocumentChunkRepository(databasePool);

  const downloadService = new DownloadS3ObjectService(s3Client);
  const embeddingProvider = new OpenAIEmbeddingProvider(openaiClient);

  const embeddingService = new EmbeddingService(
    embeddingProvider,
    chunkRepository,
  );

  const processor = new DocumentEventProcessorImpl(
    documentRepository,
    chunkRepository,
    downloadService,
    documentExtractorRegistry,
    documentChunker,
    embeddingService,
  );

  const consumer = new SqsConsumer({
    sqsClient,
    queueUrl: env.SQS_QUEUE_URL,
    processor,
  });

  try {
    await consumer.start(abortController.signal);
  } finally {
    await databasePool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Worker failed to start.", error);

  process.exitCode = 1;
});
