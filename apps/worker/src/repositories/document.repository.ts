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
            upload_status
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
    };
  }
}
