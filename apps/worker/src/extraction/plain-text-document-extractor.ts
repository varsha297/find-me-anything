import { readFile } from "node:fs/promises";

import type { DocumentExtractor } from "./document-extractor.js";
import type {
  ExtractDocumentInput,
  ExtractedDocument,
} from "./extraction.types.js";
import { normalizeExtractedText } from "./normalize-text.js";

const SUPPORTED_MIME_TYPES = new Set(["text/plain", "text/markdown"]);

export class PlainTextDocumentExtractor implements DocumentExtractor {
  supports(input: { mimeType: string; originalName: string }): boolean {
    return SUPPORTED_MIME_TYPES.has(this.normalizeMimeType(input.mimeType));
  }

  async extract(input: ExtractDocumentInput): Promise<ExtractedDocument> {
    const rawText = await readFile(input.filePath, "utf8");

    const text = normalizeExtractedText(rawText);

    if (text.length === 0) {
      throw new Error(`The document "${input.originalName}" contains no text.`);
    }

    return {
      sections: [
        {
          sectionIndex: 0,
          text,
          characterCount: text.length,
          location: {
            kind: "section",
            label: "Document",
          },
        },
      ],

      metadata: {
        title: input.originalName,
      },

      totalCharacterCount: text.length,
    };
  }

  private normalizeMimeType(mimeType: string): string {
    return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  }
}
