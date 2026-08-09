export type AskInput = {
  ownerId: string;
  question: string;
  documentId?: string;
};

export type RagSource = {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  similarity: number;
};

export type AskResult = {
  answer: string;
  sources: RagSource[];
};
