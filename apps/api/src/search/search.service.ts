import type { QueryEmbeddingService } from "../embeddings/query-embedding.service.js";

import type { SearchRepository } from "./search.repository.js";

import type { SearchInput, SearchResult } from "./search.types.js";

export class SearchService {
  constructor(
    private readonly queryEmbeddingService: QueryEmbeddingService,

    private readonly searchRepository: SearchRepository,
  ) {}

  async search(input: SearchInput): Promise<SearchResult[]> {
    const query = input.query.trim();

    if (!query) {
      throw new Error("Search query cannot be empty.");
    }

    const embedding = await this.queryEmbeddingService.embedQuery(query);

    return this.searchRepository.search({
      ownerId: input.ownerId,

      embedding,

      embeddingModel: this.queryEmbeddingService.model,

      limit: input.limit,

      documentId: input.documentId,
    });
  }
}
