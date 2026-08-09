import type {
  ExtractDocumentInput,
  ExtractedDocument,
} from "./extraction.types.js";

export interface DocumentExtractor {
  supports(input: { mimeType: string; originalName: string }): boolean;

  extract(input: ExtractDocumentInput): Promise<ExtractedDocument>;
}
