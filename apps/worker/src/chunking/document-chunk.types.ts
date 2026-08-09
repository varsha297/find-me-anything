import type { ExtractedSourceLocation } from "../extraction/extraction.types.js";

export type DocumentChunk = {
  chunkIndex: number;

  /**
   * Index of the extracted page/section from which
   * this chunk originated.
   */
  sectionIndex: number;

  content: string;
  characterCount: number;

  /**
   * This is only an approximation.
   * The real token count depends on the embedding model.
   */
  estimatedTokenCount: number;

  /**
   * PDF:
   *   { kind: "page", pageNumber: 12 }
   *
   * TXT/Markdown:
   *   { kind: "section", label: "Document" }
   */
  location: ExtractedSourceLocation;

  /**
   * Useful later for deduplication and safe reprocessing.
   */
  contentHash: string;

  /**
   * Character offsets within the original extracted section.
   */
  sourceStartOffset: number;
  sourceEndOffset: number;
};

export type ChunkDocumentOptions = {
  maxCharacters: number;
  overlapCharacters: number;
};
