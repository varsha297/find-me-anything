import { pool as databasePool } from "../database/pool.js";

import { openaiClient } from "../embeddings/openai-client.js";

import { QueryEmbeddingService } from "../embeddings/query-embedding.service.js";

import { SearchController } from "./search.controller.js";

import { SearchRepository } from "./search.repository.js";

import { SearchService } from "./search.service.js";

const queryEmbeddingService = new QueryEmbeddingService(openaiClient);

const searchRepository = new SearchRepository(databasePool);

export const searchService = new SearchService(
  queryEmbeddingService,
  searchRepository,
);

export const searchController = new SearchController(searchService);
