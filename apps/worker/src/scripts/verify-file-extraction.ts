import { readFile } from "node:fs/promises";

import { s3Client } from "../aws/s3-client.js";
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

  const event = parseS3Event(JSON.parse(rawEvent) as unknown);

  if (event.type !== "object-created") {
    throw new Error("Expected an S3 object-created event.");
  }

  const documentRepository = new DocumentRepository(databasePool);

  const downloadService = new DownloadS3ObjectService(s3Client);

  for (const record of event.records) {
    const document = await documentRepository.findByStorageLocation(
      record.bucketName,
      record.objectKey,
    );

    if (!document) {
      throw new Error("Document not found in PostgreSQL.");
    }

    const downloaded = await downloadService.execute({
      bucketName: document.s3Bucket,

      objectKey: document.s3Key,

      originalName: document.originalName,

      expectedSizeBytes: Number(document.sizeBytes),
    });

    try {
      console.log("Selecting document extractor.", {
        documentId: document.id,

        fileName: document.originalName,

        mimeType: document.mimeType,
      });

      const extracted = await documentExtractorRegistry.extract({
        filePath: downloaded.filePath,

        mimeType: document.mimeType,

        originalName: document.originalName,
      });

      console.log("File extraction completed.", {
        sectionCount: extracted.sections.length,

        totalCharacterCount: extracted.totalCharacterCount,

        metadata: extracted.metadata,
      });

      for (const section of extracted.sections.slice(0, 3)) {
        console.log({
          location: section.location,

          characterCount: section.characterCount,

          preview: section.text.slice(0, 300),
        });
      }
    } finally {
      await downloaded.cleanup();
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error("File extraction verification failed.", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await databasePool.end();
  });
