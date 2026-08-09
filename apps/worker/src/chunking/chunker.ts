import { DocumentChunker } from "./document-chunker.js";

export const documentChunker = new DocumentChunker({
  maxCharacters: 3_200,
  overlapCharacters: 400,
});
