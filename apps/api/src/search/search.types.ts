export type SearchInput = {
  ownerId: string;
  query: string;
  limit: number;
  documentId?: string;
};

export type SearchResult = {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  pageNumber: number | null;
  content: string;
  similarity: number;
};
