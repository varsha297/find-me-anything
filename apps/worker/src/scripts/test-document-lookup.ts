import { readFile } from "node:fs/promises";

import { databasePool, verifyDatabaseConnection } from "../database/pool.js";
import { parseS3Event } from "../events/parse-s3-event.js";
import { DocumentRepository } from "../repositories/document.repository.js";

async function main(): Promise<void> {
  await verifyDatabaseConnection();

  const fixtureUrl = new URL("../fixtures/upload-event.json", import.meta.url);

  const rawEvent = await readFile(fixtureUrl, "utf8");

  const payload: unknown = JSON.parse(rawEvent);
  const event = parseS3Event(payload);

  if (event.type === "test-event") {
    throw new Error(
      "The fixture contains an S3 test event, not a file-upload event.",
    );
  }

  const repository = new DocumentRepository(databasePool);

  for (const record of event.records) {
    console.log("Looking up uploaded document.", {
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
          "No document record matched the S3 event.",
          `Bucket: ${record.bucketName}`,
          `Key: ${record.objectKey}`,
        ].join("\n"),
      );
    }

    const eventSize = record.objectSize;
    const databaseSize = Number(document.sizeBytes);

    if (eventSize !== databaseSize) {
      throw new Error(
        [
          "The S3 event size does not match the database.",
          `S3 event size: ${eventSize}`,
          `Database size: ${databaseSize}`,
        ].join("\n"),
      );
    }

    if (record.documentIdFromKey && record.documentIdFromKey !== document.id) {
      throw new Error(
        [
          "The document ID in the object key does not match PostgreSQL.",
          `Path document ID: ${record.documentIdFromKey}`,
          `Database document ID: ${document.id}`,
        ].join("\n"),
      );
    }

    if (record.ownerIdFromKey && record.ownerIdFromKey !== document.ownerId) {
      throw new Error(
        [
          "The owner ID in the object key does not match PostgreSQL.",
          `Path owner ID: ${record.ownerIdFromKey}`,
          `Database owner ID: ${document.ownerId}`,
        ].join("\n"),
      );
    }

    console.log("Matching document found.", {
      id: document.id,
      ownerId: document.ownerId,
      originalName: document.originalName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      uploadStatus: document.uploadStatus,
      s3Bucket: document.s3Bucket,
      s3Key: document.s3Key,
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error("Document lookup test failed:", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await databasePool.end();
  });
