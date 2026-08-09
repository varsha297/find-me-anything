import type { Request, Response } from "express";

import { searchRequestSchema } from "./search.schema.js";

import type { SearchService } from "./search.service.js";

export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  search = async (req: Request, res: Response): Promise<void> => {
    const input = searchRequestSchema.parse(req.body);

    /*
     * IMPORTANT:
     *
     * Replace this with the same owner-id
     * mechanism used by your upload-session
     * endpoint.
     */
    const ownerId = "11111111-1111-4111-8111-111111111111";

    const results = await this.searchService.search({
      ownerId,
      query: input.query,
      limit: input.limit,
      documentId: input.documentId,
    });

    res.status(200).json({
      query: input.query,

      count: results.length,

      results,
    });
  };
}
