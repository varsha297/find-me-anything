import type { SearchService } from "../search/search.service.js";

import type { RagAnswerService } from "./rag-answer.service.js";

import type { AskInput, AskResult } from "./rag.types.js";

const RETRIEVAL_LIMIT = 5;

export class RagService {
  constructor(
    private readonly searchService: SearchService,

    private readonly answerService: RagAnswerService,
  ) {}

  async ask(input: AskInput): Promise<AskResult> {
    /*
     * STEP 1
     *
     * Semantic retrieval.
     */
    const chunks = await this.searchService.search({
      ownerId: input.ownerId,

      query: input.question,

      limit: RETRIEVAL_LIMIT,

      documentId: input.documentId,
    });

    console.log("RAG chunks retrieved.", {
      question: input.question,

      count: chunks.length,

      chunks: chunks.map((chunk) => ({
        documentName: chunk.documentName,

        pageNumber: chunk.pageNumber,

        similarity: chunk.similarity,
      })),
    });

    /*
     * STEP 2
     *
     * Generate grounded answer.
     */
    const answer = await this.answerService.generateAnswer({
      question: input.question,

      chunks,
    });

    /*
     * STEP 3
     *
     * Sources come from OUR DATABASE,
     * not from the LLM.
     */
    const sources = chunks.map((chunk) => ({
      chunkId: chunk.chunkId,

      documentId: chunk.documentId,

      documentName: chunk.documentName,

      pageNumber: chunk.pageNumber,

      similarity: chunk.similarity,
    }));

    return {
      answer,
      sources,
    };
  }
}
