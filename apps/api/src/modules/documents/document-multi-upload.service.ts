import type { CreateMultipleUploadSessionsInput } from "./document-upload.schema.ts";
import {
  createDocumentUploadSession,
  type CreateUploadSessionResult,
} from "./document-upload.service.ts";

export interface CreateMultipleUploadSessionsResult {
  uploads: CreateUploadSessionResult[];
}

export async function createMultipleDocumentUploadSessions(
  input: CreateMultipleUploadSessionsInput,
  ownerId: string,
): Promise<CreateMultipleUploadSessionsResult> {
  const uploads: CreateUploadSessionResult[] = [];

  /*
   * Run sequentially first.
   *
   * This is intentionally simpler and avoids
   * opening several database/S3 signing operations
   * simultaneously while you are learning.
   */
  for (const file of input.files) {
    const uploadSession = await createDocumentUploadSession(file, ownerId);

    uploads.push(uploadSession);
  }

  return {
    uploads,
  };
}
