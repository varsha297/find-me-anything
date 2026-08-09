import type { DocumentExtractor } from "./document-extractor.js";
import type {
  ExtractDocumentInput,
  ExtractedDocument,
} from "./extraction.types.js";

export class DocumentExtractorRegistry {
  constructor(private readonly extractors: readonly DocumentExtractor[]) {
    if (extractors.length === 0) {
      throw new Error("At least one document extractor is required.");
    }
  }

  async extract(input: ExtractDocumentInput): Promise<ExtractedDocument> {
    const matchingExtractors = this.extractors.filter((extractor) =>
      extractor.supports({
        mimeType: input.mimeType,
        originalName: input.originalName,
      }),
    );

    if (matchingExtractors.length === 0) {
      throw new Error(
        [
          "Unsupported document type.",
          `File: ${input.originalName}`,
          `MIME type: ${input.mimeType}`,
        ].join(" "),
      );
    }

    if (matchingExtractors.length > 1) {
      throw new Error(
        [
          "Multiple document extractors matched the same file.",
          `File: ${input.originalName}`,
          `MIME type: ${input.mimeType}`,
        ].join(" "),
      );
    }

    const extractor = matchingExtractors[0];

    if (!extractor) {
      throw new Error("Document extractor resolution failed.");
    }

    return extractor.extract(input);
  }
}
