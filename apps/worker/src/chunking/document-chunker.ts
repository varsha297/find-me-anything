import { createHash } from "node:crypto";

import type {
  ExtractedDocument,
  ExtractedSection,
} from "../extraction/extraction.types.js";
import type {
  ChunkDocumentOptions,
  DocumentChunk,
} from "./document-chunk.types.js";

const DEFAULT_OPTIONS: ChunkDocumentOptions = {
  maxCharacters: 3_200,
  overlapCharacters: 400,
};

type TextWindow = {
  content: string;
  startOffset: number;
  endOffset: number;
};

export class DocumentChunker {
  constructor(
    private readonly defaultOptions: ChunkDocumentOptions = DEFAULT_OPTIONS,
  ) {
    this.validateOptions(defaultOptions);
  }

  chunk(
    document: ExtractedDocument,
    options: Partial<ChunkDocumentOptions> = {},
  ): DocumentChunk[] {
    const resolvedOptions: ChunkDocumentOptions = {
      ...this.defaultOptions,
      ...options,
    };

    this.validateOptions(resolvedOptions);

    const chunks: DocumentChunk[] = [];

    for (const section of document.sections) {
      const sectionChunks = this.chunkSection(section, resolvedOptions);

      for (const sectionChunk of sectionChunks) {
        chunks.push({
          chunkIndex: chunks.length,
          sectionIndex: section.sectionIndex,

          content: sectionChunk.content,
          characterCount: sectionChunk.content.length,

          estimatedTokenCount: this.estimateTokenCount(sectionChunk.content),

          location: section.location,

          contentHash: this.createContentHash(sectionChunk.content),

          sourceStartOffset: sectionChunk.startOffset,

          sourceEndOffset: sectionChunk.endOffset,
        });
      }
    }

    if (chunks.length === 0) {
      throw new Error("The extracted document produced no searchable chunks.");
    }

    return chunks;
  }

  private chunkSection(
    section: ExtractedSection,
    options: ChunkDocumentOptions,
  ): TextWindow[] {
    const text = section.text.trim();

    /*
     * Empty PDF pages are allowed.
     * They simply produce no chunks.
     */
    if (text.length === 0) {
      return [];
    }

    if (text.length <= options.maxCharacters) {
      return [
        {
          content: text,
          startOffset: 0,
          endOffset: text.length,
        },
      ];
    }

    const windows: TextWindow[] = [];

    let startOffset = 0;

    while (startOffset < text.length) {
      const endOffset = this.findPreferredChunkEnd(
        text,
        startOffset,
        options.maxCharacters,
      );

      if (endOffset <= startOffset) {
        throw new Error("Chunker failed to make progress.");
      }

      const content = text.slice(startOffset, endOffset).trim();

      if (content.length > 0) {
        windows.push({
          content,
          startOffset,
          endOffset,
        });
      }

      if (endOffset >= text.length) {
        break;
      }

      const desiredNextStart = Math.max(
        startOffset + 1,
        endOffset - options.overlapCharacters,
      );

      const nextStart = this.moveToWordBoundary(text, desiredNextStart);

      /*
       * Defensive protection against an infinite loop.
       */
      startOffset = nextStart > startOffset ? nextStart : endOffset;
    }

    return windows;
  }

  private findPreferredChunkEnd(
    text: string,
    startOffset: number,
    maxCharacters: number,
  ): number {
    const hardEnd = Math.min(startOffset + maxCharacters, text.length);

    if (hardEnd >= text.length) {
      return text.length;
    }

    /*
     * Do not create a very small chunk merely to stop
     * at a paragraph or sentence boundary.
     *
     * Search for a natural boundary only in the final
     * 40% of the desired chunk.
     */
    const minimumPreferredEnd = startOffset + Math.floor(maxCharacters * 0.6);

    const paragraphBoundary = text.lastIndexOf("\n\n", hardEnd);

    if (paragraphBoundary >= minimumPreferredEnd) {
      return paragraphBoundary;
    }

    const sentenceBoundary = this.findLastSentenceBoundary(
      text,
      minimumPreferredEnd,
      hardEnd,
    );

    if (sentenceBoundary !== -1) {
      return sentenceBoundary;
    }

    const wordBoundary = text.lastIndexOf(" ", hardEnd);

    if (wordBoundary >= minimumPreferredEnd) {
      return wordBoundary;
    }

    /*
     * Some content may contain extremely long strings,
     * encoded data or no whitespace. In that case, a
     * hard split is necessary.
     */
    return hardEnd;
  }

  private findLastSentenceBoundary(
    text: string,
    minimumOffset: number,
    maximumOffset: number,
  ): number {
    for (let index = maximumOffset - 1; index >= minimumOffset; index -= 1) {
      const character = text[index];
      const nextCharacter = text[index + 1];

      const isSentenceEnding =
        character === "." || character === "?" || character === "!";

      const followedByWhitespace =
        nextCharacter === undefined || /\s/.test(nextCharacter);

      if (isSentenceEnding && followedByWhitespace) {
        return index + 1;
      }
    }

    return -1;
  }

  private moveToWordBoundary(text: string, offset: number): number {
    let index = offset;

    /*
     * If overlap begins in the middle of a word,
     * move forward to the next boundary.
     */
    while (index < text.length && !/\s/.test(text[index] ?? "")) {
      index += 1;
    }

    /*
     * Skip whitespace before starting the next chunk.
     */
    while (index < text.length && /\s/.test(text[index] ?? "")) {
      index += 1;
    }

    return index;
  }

  private estimateTokenCount(content: string): number {
    /*
     * English text commonly averages around four
     * characters per token.
     *
     * This is only for diagnostics. Before calling
     * an embedding model, we can use that model's
     * actual tokenizer if strict limits are required.
     */
    return Math.ceil(content.length / 4);
  }

  private createContentHash(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }

  private validateOptions(options: ChunkDocumentOptions): void {
    if (
      !Number.isInteger(options.maxCharacters) ||
      options.maxCharacters < 500
    ) {
      throw new Error("maxCharacters must be an integer of at least 500.");
    }

    if (
      !Number.isInteger(options.overlapCharacters) ||
      options.overlapCharacters < 0
    ) {
      throw new Error("overlapCharacters must be a non-negative integer.");
    }

    if (options.overlapCharacters >= options.maxCharacters) {
      throw new Error("overlapCharacters must be smaller than maxCharacters.");
    }
  }
}
