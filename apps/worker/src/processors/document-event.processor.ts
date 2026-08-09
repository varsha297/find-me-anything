import type { DocumentChunker } from "../chunking/document-chunker.js";
import type { EmbeddingService } from "../embeddings/embedding-service.js";
import type { DocumentExtractorRegistry } from "../extraction/document-extractor-registry.js";
import type { ParsedS3ObjectCreatedRecord } from "../events/parse-s3-event.js";
import type { DocumentEventProcessor } from "../queue/sqs-consumer.js";
import type { DocumentChunkRepository } from "../repositories/document-chunk.repository.js";
import type {
  DocumentRepository,
  StoredDocument,
} from "../repositories/document.repository.js";
import type { DownloadS3ObjectService } from "../storage/download-s3-object.service.js";
import { validateExtractionQuality } from "../extraction/extraction-quality.js";

export class DocumentEventProcessorImpl implements DocumentEventProcessor {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly chunkRepository: DocumentChunkRepository,
    private readonly downloadService: DownloadS3ObjectService,
    private readonly extractorRegistry: DocumentExtractorRegistry,
    private readonly chunker: DocumentChunker,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async process(record: ParsedS3ObjectCreatedRecord): Promise<void> {
    /*
     * Step 1:
     * Find the PostgreSQL document that belongs
     * to this S3 object.
     */
    const document = await this.documentRepository.findByStorageLocation(
      record.bucketName,
      record.objectKey,
    );

    if (!document) {
      throw new Error(
        [
          "No document matched the S3 event.",
          `Bucket: ${record.bucketName}`,
          `Key: ${record.objectKey}`,
        ].join(" "),
      );
    }

    /*
     * Step 2:
     * Make sure the S3 event actually belongs
     * to the document we found.
     */
    this.validateEvent(document, record);

    /*
     * Step 3:
     * Atomically claim the document.
     *
     * This prevents multiple workers from
     * processing the same document at the
     * same time.
     */
    const claim = await this.documentRepository.claimForProcessing({
      documentId: document.id,
      ownerId: document.ownerId,
      processingVersion: document.processingVersion,
    });

    /*
     * S3/SQS can deliver duplicate events.
     *
     * If the document is already completely
     * processed, we can safely ignore it.
     */
    if (claim.status === "already-ready") {
      console.log("Document is already indexed. Skipping duplicate event.", {
        documentId: document.id,
      });

      return;
    }

    /*
     * Another worker currently owns this job.
     *
     * Throwing means the SQS message is NOT
     * deleted and can be retried later.
     */
    if (claim.status === "busy") {
      throw new Error(`Document ${document.id} is already being processed.`);
    }

    /*
     * Step 4:
     * Run the actual document-processing pipeline.
     */
    try {
      await this.processClaimedDocument(document);
    } catch (error) {
      /*
       * Convert unknown errors into something
       * we can persist in PostgreSQL.
       */
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      /*
       * Record the processing failure.
       */
      await this.documentRepository.markFailed({
        documentId: document.id,

        ownerId: document.ownerId,

        errorMessage,
      });

      /*
       * IMPORTANT:
       *
       * Re-throw the error.
       *
       * The SQS consumer should only delete
       * the message when processing succeeds.
       */
      throw error;
    }
  }

  private async processClaimedDocument(
    document: StoredDocument,
  ): Promise<void> {
    console.log("Downloading document.", {
      documentId: document.id,

      fileName: document.originalName,
    });

    /*
     * Step 5:
     * Download the actual file bytes from S3
     * into a temporary local file.
     */
    const downloaded = await this.downloadService.execute({
      bucketName: document.s3Bucket,

      objectKey: document.s3Key,

      originalName: document.originalName,

      expectedSizeBytes: Number(document.sizeBytes),
    });

    try {
      /*
       * Step 6:
       * Extract text from the downloaded file.
       */
      await this.documentRepository.updateProcessingStep({
        documentId: document.id,

        ownerId: document.ownerId,

        step: "extracting",
      });

      const extracted = await this.extractorRegistry.extract({
        filePath: downloaded.filePath,

        mimeType: document.mimeType,

        originalName: document.originalName,
      });

      const extractedText = extracted.sections
        .map((section) => section.text)
        .join("\n");

      const extractionQuality = validateExtractionQuality(extractedText);

      console.log("Extraction quality checked.", {
        documentId: document.id,

        totalCharacters: extractionQuality.totalCharacters,

        suspiciousCharacters: extractionQuality.suspiciousCharacters,

        suspiciousRatio: extractionQuality.suspiciousRatio,

        isAcceptable: extractionQuality.isAcceptable,
      });

      if (!extractionQuality.isAcceptable) {
        throw new Error(
          [
            "Document text extraction quality is unacceptable.",
            extractionQuality.reason ?? "Unknown extraction-quality problem.",
            `Suspicious ratio: ${extractionQuality.suspiciousRatio}.`,
          ].join(" "),
        );
      }
      /*
       * Step 7:
       * Split the extracted text into smaller
       * searchable chunks.
       */
      await this.documentRepository.updateProcessingStep({
        documentId: document.id,

        ownerId: document.ownerId,

        step: "chunking",
      });

      const chunks = this.chunker.chunk(extracted);

      if (chunks.length === 0) {
        throw new Error(
          `No text chunks were created for document ${document.id}.`,
        );
      }

      console.log("Document chunked.", {
        documentId: document.id,

        chunkCount: chunks.length,
      });

      /*
       * Step 8:
       * Store the human-readable chunks first.
       *
       * At this point their embedding column
       * will still be NULL.
       */
      await this.documentRepository.updateProcessingStep({
        documentId: document.id,

        ownerId: document.ownerId,

        step: "storing",
      });

      await this.chunkRepository.replaceDocumentChunks({
        documentId: document.id,

        ownerId: document.ownerId,

        processingVersion: document.processingVersion,

        chunks,
      });

      console.log("Document chunks stored.", {
        documentId: document.id,

        chunkCount: chunks.length,
      });

      /*
       * Step 9:
       * AI STARTS HERE.
       *
       * Read chunks whose embedding IS NULL,
       * send their content to the embedding
       * model, and save the vectors back into
       * document_chunks.
       */
      await this.documentRepository.updateProcessingStep({
        documentId: document.id,

        ownerId: document.ownerId,

        step: "embedding",
      });

      const embeddedChunkCount = await this.embeddingService.embedDocument(
        document.id,
      );

      console.log("Document embeddings generated.", {
        documentId: document.id,

        totalChunks: chunks.length,

        embeddedChunkCount,
      });

      /*
       * For a fresh upload every newly-created
       * chunk should have been embedded.
       */
      if (embeddedChunkCount !== chunks.length) {
        throw new Error(
          [
            "Not all document chunks were embedded.",
            `Expected: ${chunks.length}.`,
            `Embedded: ${embeddedChunkCount}.`,
          ].join(" "),
        );
      }

      /*
       * Step 10:
       * Calculate page count from extraction
       * metadata.
       */
      const pageNumbers = extracted.sections
        .filter((section) => section.location.kind === "page")
        .map((section) =>
          section.location.kind === "page" ? section.location.pageNumber : 0,
        );

      const pageCount =
        pageNumbers.length > 0 ? Math.max(...pageNumbers) : null;

      /*
       * Step 11:
       * The document is only READY after:
       *
       * download
       * extraction
       * chunking
       * chunk storage
       * embedding generation
       * vector storage
       *
       * have all succeeded.
       */
      await this.documentRepository.markReady({
        documentId: document.id,

        ownerId: document.ownerId,

        chunkCount: chunks.length,

        pageCount,
      });

      console.log("Document indexed successfully.", {
        documentId: document.id,

        fileName: document.originalName,

        chunkCount: chunks.length,

        embeddedChunkCount,

        pageCount,
      });
    } finally {
      /*
       * Step 12:
       * Always remove the temporary local file,
       * even when processing fails.
       *
       * The original remains safely in S3.
       */
      await downloaded.cleanup();
    }
  }

  private validateEvent(
    document: StoredDocument,
    record: ParsedS3ObjectCreatedRecord,
  ): void {
    const expectedSize = Number(document.sizeBytes);

    /*
     * Make sure the size reported by S3
     * matches the file metadata stored when
     * the upload session was created.
     */
    if (expectedSize !== record.objectSize) {
      throw new Error(
        [
          "S3 event size does not match PostgreSQL.",
          `Expected: ${expectedSize}`,
          `Received: ${record.objectSize}`,
        ].join(" "),
      );
    }

    /*
     * Your S3 key contains the document ID.
     *
     * Validate it against PostgreSQL.
     */
    if (record.documentIdFromKey && record.documentIdFromKey !== document.id) {
      throw new Error("Document ID in the S3 key does not match PostgreSQL.");
    }

    /*
     * Same validation for owner ID.
     */
    if (record.ownerIdFromKey && record.ownerIdFromKey !== document.ownerId) {
      throw new Error("Owner ID in the S3 key does not match PostgreSQL.");
    }
  }
}
