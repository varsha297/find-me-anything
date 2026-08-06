import { readFile } from "node:fs/promises";

import { s3Client } from "../aws/s3-client.js";
import { databasePool, verifyDatabaseConnection } from "../database/pool.js";
import { validatePdfFile } from "../documents/validate-pdf-file.js";
import { parseS3Event } from "../events/parse-s3-event.js";
import { DocumentRepository } from "../repositories/document.repository.js";
import { DownloadS3ObjectService } from "../storage/download-s3-object.service.js";

async function main(): Promise<void> {
  await verifyDatabaseConnection();

  const fixtureUrl = new URL("../fixtures/upload-event.json", import.meta.url);

  const rawEvent = await readFile(fixtureUrl, "utf8");

  const payload: unknown = JSON.parse(rawEvent);

  const event = parseS3Event(payload);

  if (event.type === "test-event") {
    throw new Error(
      "The fixture contains an S3 test event instead of an upload event.",
    );
  }

  const repository = new DocumentRepository(databasePool);

  const downloadService = new DownloadS3ObjectService(s3Client);

  for (const record of event.records) {
    console.log("Finding document in PostgreSQL.", {
      bucket: record.bucketName,
      key: record.objectKey,
    });

    const document = await repository.findByStorageLocation(
      record.bucketName,
      record.objectKey,
    );

    if (!document) {
      throw new Error(
        [
          "No matching document was found.",
          `Bucket: ${record.bucketName}`,
          `Key: ${record.objectKey}`,
        ].join("\n"),
      );
    }

    const expectedSizeBytes = Number(document.sizeBytes);

    if (expectedSizeBytes !== record.objectSize) {
      throw new Error(
        [
          "S3 event size does not match PostgreSQL.",
          `Event: ${record.objectSize}`,
          `Database: ${expectedSizeBytes}`,
        ].join("\n"),
      );
    }

    console.log("Downloading PDF from S3.", {
      documentId: document.id,
      originalName: document.originalName,
      sizeBytes: expectedSizeBytes,
    });

    const downloaded = await downloadService.execute({
      bucketName: document.s3Bucket,
      objectKey: document.s3Key,
      originalName: document.originalName,
      expectedSizeBytes,
    });

    try {
      await validatePdfFile(downloaded.filePath);

      console.log("PDF downloaded and validated.", {
        documentId: document.id,
        filePath: downloaded.filePath,
        sizeBytes: downloaded.sizeBytes,
      });
    } finally {
      await downloaded.cleanup();

      console.log("Temporary PDF deleted.");
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error("S3 download test failed:", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await databasePool.end();
  });
