import type { Pool } from "pg";

export type DocumentProcessingStatus = {
  id: string;
  uploadStatus: string;
  processingStatus: string;
  processingStep: string | null;
  chunkCount: number;
  processingError: string | null;
};

type DocumentProcessingStatusRow = {
  id: string;
  upload_status: string;
  processing_status: string;
  processing_step: string | null;
  chunk_count: number;
  processing_error: string | null;
};

export class DocumentRepository {
  constructor(private readonly database: Pool) {}

  async findProcessingStatus(
    documentId: string,
    ownerId: string,
  ): Promise<DocumentProcessingStatus | null> {
    const result = await this.database.query<DocumentProcessingStatusRow>(
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
