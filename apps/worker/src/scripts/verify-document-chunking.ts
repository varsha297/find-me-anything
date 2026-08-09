import { readFile } from "node:fs/promises";

import { s3Client } from "../aws/s3-client.js";
import { documentChunker } from "../chunking/chunker.js";
import { databasePool, verifyDatabaseConnection } from "../database/pool.js";
import { documentExtractorRegistry } from "../extraction/extractor-registry.js";
import { parseS3Event } from "../events/parse-s3-event.js";
import { DocumentRepository } from "../repositories/document.repository.js";
import { DownloadS3ObjectService } from "../storage/download-s3-object.service.js";

async function main(): Promise<void> {
  await verifyDatabaseConnection();

  const rawEvent = await readFile(
    new URL("../fixtures/upload-event.json", import.meta.url),
    "utf8",
  );

  const payload: unknown = JSON.parse(rawEvent);

  const event = parseS3Event(payload);

  if (event.type !== "object-created") {
    throw new Error("Expected an S3 ObjectCreated event.");
  }

  const documentRepository = new DocumentRepository(databasePool);

  const downloadService = new DownloadS3ObjectService(s3Client);

  for (const record of event.records) {
    const document = await documentRepository.findByStorageLocation(
      record.bucketName,
      record.objectKey,
    );

    if (!document) {
      throw new Error(
        [
          "No PostgreSQL document matched the S3 event.",
          `Bucket: ${record.bucketName}`,
          `Key: ${record.objectKey}`,
        ].join("\n"),
      );
    }

    const downloaded = await downloadService.execute({
      bucketName: document.s3Bucket,

      objectKey: document.s3Key,

      originalName: document.originalName,

      expectedSizeBytes: Number(document.sizeBytes),
    });

    try {
      console.log("Extracting document.", {
        documentId: document.id,

        originalName: document.originalName,

        mimeType: document.mimeType,
      });

      const extracted = await documentExtractorRegistry.extract({
        filePath: downloaded.filePath,

        mimeType: document.mimeType,

        originalName: document.originalName,
      });

      console.log("Creating searchable chunks.");

      const chunks = documentChunker.chunk(extracted);

      const totalChunkCharacters = chunks.reduce(
        (total, chunk) => total + chunk.characterCount,
        0,
      );

      const averageChunkSize = Math.round(totalChunkCharacters / chunks.length);

      console.log("Chunking completed.", {
        documentId: document.id,

        extractedSections: extracted.sections.length,

        chunkCount: chunks.length,

        averageChunkSize,

        totalExtractedCharacters: extracted.totalCharacterCount,

        totalChunkCharacters,
      });

      /*
       * Print only small previews.
       */
      for (const chunk of chunks.slice(0, 5)) {
        console.log({
          chunkIndex: chunk.chunkIndex,

          sectionIndex: chunk.sectionIndex,

          location: chunk.location,

          characterCount: chunk.characterCount,

          estimatedTokenCount: chunk.estimatedTokenCount,

          contentHash: chunk.contentHash.slice(0, 12),

          preview: chunk.content.slice(0, 300),
        });
      }
    } finally {
      await downloaded.cleanup();

      console.log("Temporary file deleted.");
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error("Document chunking verification failed.", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await databasePool.end();
  });
