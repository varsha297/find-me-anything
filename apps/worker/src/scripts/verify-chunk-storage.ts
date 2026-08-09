import { readFile } from "node:fs/promises";

import { s3Client } from "../aws/s3-client.js";
import { documentChunker } from "../chunking/chunker.js";
import { databasePool, verifyDatabaseConnection } from "../database/pool.js";
import { documentExtractorRegistry } from "../extraction/extractor-registry.js";
import { parseS3Event } from "../events/parse-s3-event.js";
import { DocumentChunkRepository } from "../repositories/document-chunk.repository.js";
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

  const chunkRepository = new DocumentChunkRepository(databasePool);

  const downloadService = new DownloadS3ObjectService(s3Client);

  for (const record of event.records) {
    const document = await documentRepository.findByStorageLocation(
      record.bucketName,
      record.objectKey,
    );

    if (!document) {
      throw new Error("No document matched the S3 event.");
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

        fileName: document.originalName,
      });

      const extracted = await documentExtractorRegistry.extract({
        filePath: downloaded.filePath,

        mimeType: document.mimeType,

        originalName: document.originalName,
      });

      const chunks = documentChunker.chunk(extracted);

      console.log("Storing document chunks.", {
        documentId: document.id,

        processingVersion: document.processingVersion,

        chunkCount: chunks.length,
      });

      const storedCount = await chunkRepository.replaceDocumentChunks({
        documentId: document.id,

        ownerId: document.ownerId,

        processingVersion: document.processingVersion,

        chunks,
      });

      console.log("Document chunks stored.", {
        documentId: document.id,

        storedCount,
      });
    } finally {
      await downloaded.cleanup();
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error("Chunk storage verification failed.", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await databasePool.end();
  });
