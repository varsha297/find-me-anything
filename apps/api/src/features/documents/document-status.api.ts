export type DocumentStatus = {
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
};

const API_BASE_URL = "http://localhost:4000";

export async function getDocumentStatus(
  documentId: string,
): Promise<DocumentStatus> {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${documentId}/status`,
  );

  if (!response.ok) {
    throw new Error("Could not load document processing status.");
  }

  return response.json();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export async function waitUntilDocumentReady(
  documentId: string,
): Promise<DocumentStatus> {
  const maxAttempts = 60;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await getDocumentStatus(documentId);

    console.log("Document processing status", status);

    if (status.processingStatus === "ready") {
      return status;
    }

    if (status.processingStatus === "failed") {
      throw new Error(status.processingError ?? "Document processing failed.");
    }

    await sleep(2_000);
  }

  throw new Error("Document processing timed out.");
}
