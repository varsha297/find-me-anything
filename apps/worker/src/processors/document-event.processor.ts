import type { ParsedS3ObjectCreatedRecord } from "../events/parse-s3-event.js";
import type { DocumentEventProcessor } from "../queue/sqs-consumer.js";

export class DocumentEventProcessorImpl implements DocumentEventProcessor {
  async process(record: ParsedS3ObjectCreatedRecord): Promise<void> {
    console.log("Document event received.", {
      eventName: record.eventName,
      bucket: record.bucketName,
      key: record.objectKey,
      size: record.objectSize,
      documentId: record.documentIdFromKey,
      ownerId: record.ownerIdFromKey,
    });

    /*
     * Do not remove this error yet.
     *
     * The next implementation will replace it with:
     * 1. PostgreSQL lookup
     * 2. Document claim
     * 3. S3 download
     * 4. PDF extraction
     * 5. Chunking
     * 6. Embeddings
     * 7. pgvector storage
     */
    throw new Error("Document processing pipeline is not implemented yet.");
  }
}
