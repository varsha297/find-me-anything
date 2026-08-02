import { randomUUID } from "node:crypto";

import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { env } from "../../config/env.ts";
import { pool } from "../../database/pool.ts";
import { s3Client } from "../../infrastructure/aws/s3-client.ts";
import type { CreateUploadSessionInput } from "./document-upload.schema.ts";
import { sanitizeFileName } from "./sanitize-file-name.ts";

export interface CreateUploadSessionResult {
  document: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    uploadStatus: "pending";
    processingStatus: "not_started";
  };

  upload: {
    method: "POST";
    url: string;
    fields: Record<string, string>;
    expiresInSeconds: number;
  };
}

export async function createDocumentUploadSession(
  input: CreateUploadSessionInput,
  ownerId: string,
): Promise<CreateUploadSessionResult> {
  const documentId = randomUUID();

  const sanitizedName = sanitizeFileName(input.fileName);

  const s3Key = [
    "private",
    ownerId,
    "documents",
    documentId,
    "original",
    sanitizedName,
  ].join("/");

  let documentCreated = false;

  try {
    await pool.query(
      `
    INSERT INTO documents (
      id,
      owner_id,
      original_name,
      sanitized_name,
      mime_type,
      size_bytes,
      s3_bucket,
      s3_key,
      upload_status,
      processing_status
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      'pending',
      'not_started'
    )
  `,
      [
        documentId,
        ownerId,
        input.fileName,
        sanitizedName,
        input.mimeType,
        input.sizeBytes,
        env.S3_BUCKET_NAME,
        s3Key,
      ],
    );

    documentCreated = true;

    const presignedPost = await createPresignedPost(s3Client, {
      Bucket: env.S3_BUCKET_NAME,
      Key: s3Key,

      Expires: env.UPLOAD_SESSION_EXPIRES_SECONDS,

      Fields: {
        "Content-Type": input.mimeType,

        "x-amz-meta-document-id": documentId,

        "x-amz-meta-owner-id": ownerId,
      },

      Conditions: [
        {
          "Content-Type": input.mimeType,
        },

        {
          "x-amz-meta-document-id": documentId,
        },

        {
          "x-amz-meta-owner-id": ownerId,
        },

        ["content-length-range", input.sizeBytes, input.sizeBytes],
      ],
    });

    return {
      document: {
        id: documentId,
        originalName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        uploadStatus: "pending",
        processingStatus: "not_started",
      },

      upload: {
        method: "POST",
        url: presignedPost.url,
        fields: presignedPost.fields,
        expiresInSeconds: env.UPLOAD_SESSION_EXPIRES_SECONDS,
      },
    };
  } catch (error) {
    if (documentCreated) {
      await pool
        .query(
          `
            UPDATE documents
            SET
              upload_status = 'failed',
              last_error_code = 'UPLOAD_SESSION_CREATION_FAILED',
              last_error_message = $2
            WHERE id = $1
          `,
          [
            documentId,
            error instanceof Error
              ? error.message
              : "Unknown upload-session error",
          ],
        )
        .catch(() => {
          // Do not hide the original AWS/database error
          // if updating the failure status also fails.
        });
    }

    throw error;
  }
}
