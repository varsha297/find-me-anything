import type { Pool } from "pg";

export type StoredDocument = {
  id: string;
  ownerId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  s3Bucket: string;
  s3Key: string;
  uploadStatus: string;
  processingVersion: number;
};

type StoredDocumentRow = {
  id: string;
  owner_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  s3_bucket: string;
  s3_key: string;
  upload_status: string;
  processing_version: number;
};

export type DocumentClaimResult =
  | {
      status: "claimed";
    }
  | {
      status: "already-ready";
    }
  | {
      status: "busy";
    };

export type ProcessingStep =
  | "downloading"
  | "extracting"
  | "chunking"
  | "storing"
  | "embedding";

type ProcessingStatusRow = {
  processing_status: string;
};

export type DocumentProcessingStatus = {
  id: string;
  uploadStatus: string;
  processingStatus: string;
  processingStep: string | null;
  chunkCount: number;
  processingError: string | null;
};

export class DocumentRepository {
  constructor(private readonly database: Pool) {}

  async findByStorageLocation(
    bucketName: string,
    objectKey: string,
  ): Promise<StoredDocument | null> {
    const result = await this.database.query<StoredDocumentRow>(
      `
          SELECT
            id,
            owner_id,
            original_name,
            mime_type,
            size_bytes::text,
            s3_bucket,
            s3_key,
            upload_status,
            processing_version
          FROM documents
          WHERE s3_bucket = $1
            AND s3_key = $2
          LIMIT 1
        `,
      [bucketName, objectKey],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      ownerId: row.owner_id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      s3Bucket: row.s3_bucket,
      s3Key: row.s3_key,
      uploadStatus: row.upload_status,
      processingVersion: row.processing_version,
    };
  }

  async claimForProcessing(input: {
    documentId: string;
    ownerId: string;
    processingVersion: number;
  }): Promise<DocumentClaimResult> {
    /*
     * Claim the document atomically.
     *
     * Only documents that are waiting, queued, failed,
     * or stuck for more than 15 minutes can be claimed.
     */
    const claimResult = await this.database.query<{
      id: string;
    }>(
      `
        UPDATE documents
        SET
          upload_status = 'uploaded',
          processing_status = 'processing',
          processing_step = 'downloading',
          processing_error = NULL,
          processing_attempts =
            processing_attempts + 1,
          processing_started_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND owner_id = $2
          AND processing_version = $3
          AND (
            processing_status IN (
              'not_started',
              'queued',
              'failed'
            )
            OR (
              processing_status = 'processing'
              AND processing_started_at <
                NOW() - INTERVAL '15 minutes'
            )
          )
        RETURNING id
      `,
      [input.documentId, input.ownerId, input.processingVersion],
    );

    if (claimResult.rows[0]) {
      return {
        status: "claimed",
      };
    }

    /*
     * The UPDATE did not claim it. Determine why.
     */
    const statusResult = await this.database.query<ProcessingStatusRow>(
      `
          SELECT processing_status
          FROM documents
          WHERE id = $1
            AND owner_id = $2
            AND processing_version = $3
          LIMIT 1
        `,
      [input.documentId, input.ownerId, input.processingVersion],
    );

    const document = statusResult.rows[0];

    if (!document) {
      throw new Error(`Document ${input.documentId} was not found.`);
    }

    if (document.processing_status === "ready") {
      return {
        status: "already-ready",
      };
    }

    return {
      status: "busy",
    };
  }

  async updateProcessingStep(input: {
    documentId: string;
    ownerId: string;
    step: ProcessingStep;
  }): Promise<void> {
    const result = await this.database.query(
      `
        UPDATE documents
        SET
          processing_step = $3,
          updated_at = NOW()
        WHERE id = $1
          AND owner_id = $2
          AND processing_status = 'processing'
      `,
      [input.documentId, input.ownerId, input.step],
    );

    if (!result.rowCount) {
      throw new Error(
        `Could not update processing step for document ${input.documentId}.`,
      );
    }
  }

  async markReady(input: {
    documentId: string;
    ownerId: string;
    chunkCount: number;
    pageCount: number | null;
  }): Promise<void> {
    const result = await this.database.query(
      `
        UPDATE documents
        SET
          upload_status = 'uploaded',
          processing_status = 'ready',
          processing_step = 'completed',
          processing_error = NULL,
          chunk_count = $3,
          page_count = $4,
          processed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND owner_id = $2
          AND processing_status = 'processing'
      `,
      [input.documentId, input.ownerId, input.chunkCount, input.pageCount],
    );

    if (!result.rowCount) {
      throw new Error(`Could not mark document ${input.documentId} as ready.`);
    }
  }

  async markFailed(input: {
    documentId: string;
    ownerId: string;
    errorMessage: string;
  }): Promise<void> {
    const result = await this.database.query(
      `
        UPDATE documents
        SET
          processing_status = 'failed',
          processing_error = $3,
          updated_at = NOW()
        WHERE id = $1
          AND owner_id = $2
      `,
      [input.documentId, input.ownerId, input.errorMessage.slice(0, 5_000)],
    );

    if (!result.rowCount) {
      console.error("Could not mark document as failed.", {
        documentId: input.documentId,
        ownerId: input.ownerId,
      });
    }
  }

  async findProcessingStatus(documentId: string, ownerId: string) {
    const result = await this.database.query<{
      id: string;
      upload_status: string;
      processing_status: string;
      processing_step: string | null;
      chunk_count: number;
      processing_error: string | null;
    }>(
      `
      SELECT
        id,
        upload_status,
        processing_status,
        processing_step,
        chunk_count,
        processing_error
      FROM documents
      WHERE id = $1
        AND owner_id = $2
      LIMIT 1
    `,
      [documentId, ownerId],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      uploadStatus: row.upload_status,
      processingStatus: row.processing_status,
      processingStep: row.processing_step,
      chunkCount: row.chunk_count,
      processingError: row.processing_error,
    };
  }
}
