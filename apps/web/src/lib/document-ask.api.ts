const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export interface DocumentAnswerSource {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  similarity: number;
}

export interface DocumentAnswer {
  question: string;
  answer: string;
  sources: DocumentAnswerSource[];
}

export interface AskDocumentInput {
  question: string;
  documentId?: string;
}

interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}

export async function askDocument(
  input: AskDocumentInput,
): Promise<DocumentAnswer> {
  const question = input.question.trim();

  if (!question) {
    throw new Error("Question is required.");
  }

  const response = await fetch(`${API_BASE_URL}/api/ask`, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      question,

      ...(input.documentId
        ? {
            documentId: input.documentId,
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = (await response
      .json()
      .catch(() => null)) as ApiErrorResponse | null;

    throw new Error(
      errorBody?.error?.message ??
        `Question failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as DocumentAnswer;
}
