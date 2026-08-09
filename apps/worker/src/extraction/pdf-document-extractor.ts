import {
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import type { DocumentExtractor } from "./document-extractor.js";
import type {
  ExtractDocumentInput,
  ExtractedDocument,
  ExtractedSection,
} from "./extraction.types.js";
import { normalizeExtractedText } from "./normalize-text.js";

type PdfTextItem = {
  str: string;
  hasEOL?: boolean;
};

type PdfMetadataInfo = {
  Title?: unknown;
  Author?: unknown;
};

function isPdfTextItem(value: unknown): value is PdfTextItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "str" in value &&
    typeof value.str === "string"
  );
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

export class PdfDocumentExtractor implements DocumentExtractor {
  supports(input: { mimeType: string; originalName: string }): boolean {
    return this.normalizeMimeType(input.mimeType) === "application/pdf";
  }

  async extract(input: ExtractDocumentInput): Promise<ExtractedDocument> {
    const loadingTask = getDocument({
      url: input.filePath,
      useSystemFonts: true,
    });

    const pdfDocument = await loadingTask.promise;

    try {
      const sections: ExtractedSection[] = [];

      /*
       * Process sequentially for now.
       *
       * This avoids loading every PDF page into memory
       * at the same time.
       */
      for (
        let pageNumber = 1;
        pageNumber <= pdfDocument.numPages;
        pageNumber += 1
      ) {
        const page = await pdfDocument.getPage(pageNumber);

        try {
          const textContent = await page.getTextContent();

          const parts: string[] = [];

          for (const item of textContent.items) {
            if (!isPdfTextItem(item)) {
              continue;
            }

            parts.push(item.str);

            parts.push(item.hasEOL ? "\n" : " ");
          }

          const text = normalizeExtractedText(parts.join(""));

          sections.push({
            sectionIndex: pageNumber - 1,

            text,

            characterCount: text.length,

            location: {
              kind: "page",
              pageNumber,
            },
          });
        } finally {
          page.cleanup();
        }
      }

      const metadata = await this.extractMetadata(
        pdfDocument,
        input.originalName,
      );

      const totalCharacterCount = sections.reduce(
        (total, section) => total + section.characterCount,
        0,
      );

      if (totalCharacterCount === 0) {
        throw new Error(
          [
            `The PDF "${input.originalName}" contains no extractable text.`,
            "It may be a scanned or image-only PDF that requires OCR.",
          ].join(" "),
        );
      }

      return {
        sections,
        metadata,
        totalCharacterCount,
      };
    } finally {
      await loadingTask.destroy();
    }
  }

  private async extractMetadata(
    pdfDocument: PDFDocumentProxy,
    originalName: string,
  ): Promise<ExtractedDocument["metadata"]> {
    try {
      const result = await pdfDocument.getMetadata();

      const info = result.info as PdfMetadataInfo;

      return {
        title: optionalString(info.Title) ?? originalName,

        author: optionalString(info.Author),
      };
    } catch {
      /*
       * Metadata is optional.
       * Metadata failure should not fail document
       * text extraction.
       */
      return {
        title: originalName,
      };
    }
  }

  private normalizeMimeType(mimeType: string): string {
    return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  }
}
