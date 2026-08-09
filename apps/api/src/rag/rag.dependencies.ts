import { openaiClient } from "../embeddings/openai-client.js";

import { searchService } from "../search/search.dependencies.js";

import { RagAnswerService } from "./rag-answer.service.js";

import { RagController } from "./rag.controller.js";

import { RagService } from "./rag.service.js";

const answerService = new RagAnswerService(openaiClient);

const ragService = new RagService(searchService, answerService);

export const ragController = new RagController(ragService);
