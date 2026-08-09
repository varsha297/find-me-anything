const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

export const MAX_FILES_PER_BATCH = 10;

export const MAX_BATCH_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export type AllowedDocumentMimeType =
  (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

/*
 * Returned by:
 *
 * POST /api/documents/upload-session
 *
 * This is created BEFORE the actual file
 * is uploaded to S3.
 */
export interface DocumentUploadSession {
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

/*
 * Returned by:
 *
 * GET /api/documents/:documentId/status
 *
 * This lets the frontend know what the
 * background worker is currently doing.
 */
export interface DocumentStatus {
  id: string;

  uploadStatus: string;

  processingStatus:
    | "not_started"
    | "queued"
    | "processing"
    | "ready"
    | "failed";

  processingStep:
    | "downloading"
    | "extracting"
    | "chunking"
    | "storing"
    | "embedding"
    | "completed"
    | null;

  chunkCount: number;

  processingError: string | null;
}

interface MultipleUploadSessionsResponse {
  uploads: DocumentUploadSession[];
}

interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

const MIME_TYPE_BY_EXTENSION: Record<string, AllowedDocumentMimeType> = {
  ".pdf": "application/pdf",

  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  ".txt": "text/plain",
};

/*
 * Returns the extension including the dot.
 *
 * Example:
 *
 * "resume.pdf"
 *       ↓
 * ".pdf"
 */
function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return "";
  }

  return fileName.slice(lastDotIndex).toLowerCase();
}

/*
 * Some browsers may return an empty file.type.
 *
 * In that situation we fall back to
 * checking the file extension.
 */
export function getDocumentMimeType(
  file: File,
): AllowedDocumentMimeType | null {
  if (
    ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type as AllowedDocumentMimeType)
  ) {
    return file.type as AllowedDocumentMimeType;
  }

  const extension = getFileExtension(file.name);

  return MIME_TYPE_BY_EXTENSION[extension] ?? null;
}

/*
 * Extract a useful error message from
 * our Node API response.
 */
async function getApiErrorMessage(response: Response): Promise<string> {
  const errorBody = (await response
    .json()
    .catch(() => null)) as ApiErrorResponse | null;

  return (
    errorBody?.error?.message ?? `Request failed with status ${response.status}`
  );
}

/*
 * Existing single-file upload-session request.
 *
 * IMPORTANT:
 *
 * This does NOT upload the actual file.
 *
 * It only sends:
 *
 * fileName
 * mimeType
 * sizeBytes
 *
 * to our Node API.
 */
export async function createDocumentUploadSession(
  file: File,
): Promise<DocumentUploadSession> {
  const mimeType = getDocumentMimeType(file);

  if (!mimeType) {
    throw new Error(`${file.name} is not a supported document type.`);
  }

  const response = await fetch(`${API_BASE_URL}/api/documents/upload-session`, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      fileName: file.name,

      mimeType,

      sizeBytes: file.size,
    }),
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  return (await response.json()) as DocumentUploadSession;
}

/*
 * Multiple-file upload-session request.
 *
 * Again:
 *
 * only metadata goes to our Node API.
 *
 * Actual files will later go directly
 * from the browser to S3.
 */
export async function createMultipleDocumentUploadSessions(
  files: File[],
): Promise<DocumentUploadSession[]> {
  const filesMetadata = files.map((file) => {
    const mimeType = getDocumentMimeType(file);

    if (!mimeType) {
      throw new Error(`${file.name} is not a supported document type.`);
    }

    return {
      fileName: file.name,

      mimeType,

      sizeBytes: file.size,
    };
  });

  const response = await fetch(
    `${API_BASE_URL}/api/documents/upload-sessions`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        files: filesMetadata,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  const result = (await response.json()) as MultipleUploadSessionsResponse;

  return result.uploads;
}

/*
 * Upload ONE actual file directly
 * from the browser to S3.
 *
 * The Node API does NOT receive
 * the file bytes.
 */
export async function uploadFileDirectlyToS3(
  file: File,
  uploadSession: DocumentUploadSession,
): Promise<void> {
  const formData = new FormData();

  /*
   * AWS generated these signed fields.
   *
   * We must send them exactly as
   * returned by our API.
   */
  for (const [fieldName, fieldValue] of Object.entries(
    uploadSession.upload.fields,
  )) {
    formData.append(fieldName, fieldValue);
  }

  /*
   * This is the real local File object.
   *
   * At this point the browser reads the
   * file bytes and sends them directly
   * to Amazon S3.
   */
  formData.append("file", file);

  const response = await fetch(uploadSession.upload.url, {
    method: uploadSession.upload.method,

    body: formData,
  });

  if (!response.ok) {
    const s3ErrorBody = await response.text();

    console.error(`S3 upload failed for ${file.name}:`, s3ErrorBody);

    throw new Error(`S3 rejected ${file.name} with status ${response.status}.`);
  }
}

/*
 * NEW
 * -------------------------------
 *
 * Ask our Node API for the current
 * processing status of a document.
 *
 * Browser
 *    ↓
 * Node API
 *    ↓
 * PostgreSQL documents table
 */
export async function getDocumentStatus(
  documentId: string,
): Promise<DocumentStatus> {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${documentId}/status`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  return (await response.json()) as DocumentStatus;
}

/*
 * Small utility used by polling.
 */
function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

/*
 * NEW
 * -------------------------------
 *
 * Wait until the background worker
 * completely finishes processing
 * the document.
 *
 *
 * Example:
 *
 * status = processing / extracting
 *              ↓
 * wait 2 seconds
 *              ↓
 * status = processing / chunking
 *              ↓
 * wait 2 seconds
 *              ↓
 * status = processing / embedding
 *              ↓
 * wait 2 seconds
 *              ↓
 * status = ready / completed
 *              ↓
 * return
 */
export async function waitUntilDocumentReady(
  documentId: string,
): Promise<DocumentStatus> {
  /*
   * 60 attempts × 2 seconds
   *
   * Maximum wait:
   *
   * 120 seconds.
   */
  const maxAttempts = 60;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await getDocumentStatus(documentId);

    console.log("Document processing status:", {
      documentId: status.id,

      processingStatus: status.processingStatus,

      processingStep: status.processingStep,

      chunkCount: status.chunkCount,

      attempt: attempt + 1,
    });

    /*
     * Worker finished:
     *
     * extract ✓
     * chunk ✓
     * store ✓
     * embed ✓
     */
    if (status.processingStatus === "ready") {
      return status;
    }

    /*
     * Something failed inside
     * the worker.
     */
    if (status.processingStatus === "failed") {
      throw new Error(status.processingError ?? "Document processing failed.");
    }

    /*
     * Still processing.
     *
     * Don't hammer our API/database.
     * Wait two seconds.
     */
    await sleep(2_000);
  }

  throw new Error("Document processing did not finish within 120 seconds.");
}

export interface ProcessedDocumentUpload {
  documentId: string;
  originalName: string;
  status: DocumentStatus;
}

export async function uploadDocumentAndWaitUntilReady(
  file: File,
): Promise<ProcessedDocumentUpload> {
  /*
   * STEP 1
   * Ask our Node API to create:
   *
   * - document DB row
   * - S3 key
   * - presigned POST
   */
  const uploadSession = await createDocumentUploadSession(file);

  console.log("Upload session created.", {
    documentId: uploadSession.document.id,
    fileName: uploadSession.document.originalName,
  });

  /*
   * STEP 2
   * Send the actual file bytes
   * directly from browser → S3.
   */
  await uploadFileDirectlyToS3(file, uploadSession);

  console.log("File uploaded to S3.", {
    documentId: uploadSession.document.id,
  });

  /*
   * STEP 3
   *
   * S3 now sends event → SQS → Worker.
   *
   * The worker:
   *
   * downloads
   * extracts
   * chunks
   * stores
   * embeds
   *
   * We wait until all of that finishes.
   */
  const status = await waitUntilDocumentReady(uploadSession.document.id);

  console.log("Document is ready.", {
    documentId: uploadSession.document.id,
    chunkCount: status.chunkCount,
  });

  return {
    documentId: uploadSession.document.id,

    originalName: uploadSession.document.originalName,

    status,
  };
}
