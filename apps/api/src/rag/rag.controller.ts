import type { Request, Response } from "express";

import { askRequestSchema } from "./rag.schema.js";

import type { RagService } from "./rag.service.js";

export class RagController {
  constructor(private readonly ragService: RagService) {}

  ask = async (req: Request, res: Response): Promise<void> => {
    const input = askRequestSchema.parse(req.body);

    /*
     * Same temporary development owner
     * used by your upload/search flow.
     *
     * Authentication will replace this later.
     */
    const ownerId = "11111111-1111-4111-8111-111111111111";

    const result = await this.ragService.ask({
      ownerId,

      question: input.question,

      documentId: input.documentId,
    });

    res.status(200).json({
      question: input.question,

      answer: result.answer,

      sources: result.sources,
    });
  };
}
