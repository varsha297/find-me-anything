import pgvector from "pgvector";
import type { Pool } from "pg";

import type { SearchResult } from "./search.types.js";

type SearchResultRow = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  similarity: number | string;
};

export class SearchRepository {
  constructor(private readonly database: Pool) {}

  async search(input: {
    ownerId: string;
    embedding: number[];
    embeddingModel: string;
    limit: number;
    documentId?: string;
  }): Promise<SearchResult[]> {
    const vector = pgvector.toSql(input.embedding);

    const result = await this.database.query<SearchResultRow>(
      `
          SELECT
            dc.id AS chunk_id,
            dc.document_id,
            d.original_name AS document_name,
            dc.chunk_index,
            dc.page_number,
            dc.content,

            (
              1 - (
                dc.embedding <=> $2::vector
              )
            ) AS similarity

          FROM document_chunks dc

          INNER JOIN documents d
            ON d.id = dc.document_id

          WHERE d.owner_id = $1

            AND dc.embedding IS NOT NULL

            AND dc.embedding_model = $3

            AND d.processing_status = 'ready'

            AND (
              $4::uuid IS NULL
              OR dc.document_id = $4
            )

          ORDER BY
            dc.embedding <=> $2::vector

          LIMIT $5
        `,
      [
        input.ownerId,
        vector,
        input.embeddingModel,
        input.documentId ?? null,
        input.limit,
      ],
    );

    return result.rows.map((row) => ({
      chunkId: row.chunk_id,

      documentId: row.document_id,

      documentName: row.document_name,

      chunkIndex: row.chunk_index,

      pageNumber: row.page_number,

      content: row.content,

      similarity: Number(row.similarity),
    }));
  }
}
