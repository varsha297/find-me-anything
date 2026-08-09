import type { Pool, PoolClient } from "pg";

import type { DocumentChunk } from "../chunking/document-chunk.types.js";
import pgvector from "pgvector";

export type ChunkAwaitingEmbedding = {
  id: string;
  content: string;
};

export type ChunkEmbeddingUpdate = {
  chunkId: string;
  embedding: number[];
};
export type ReplaceDocumentChunksInput = {
  documentId: string;
  ownerId: string;
  processingVersion: number;
  chunks: readonly DocumentChunk[];
};

type ChunkInsertRow = {
  chunkIndex: number;
  sectionIndex: number;

  content: string;
  contentHash: string;

  characterCount: number;
  estimatedTokenCount: number;

  locationKind: "page" | "section";
  pageNumber: number | null;
  sectionLabel: string | null;

  sourceStartOffset: number;
  sourceEndOffset: number;
};

export class DocumentChunkRepository {
  constructor(private readonly database: Pool) {}

  async replaceDocumentChunks(
    input: ReplaceDocumentChunksInput,
  ): Promise<number> {
    if (input.chunks.length === 0) {
      throw new Error("Cannot store an empty list of document chunks.");
    }

    const rows = input.chunks.map((chunk): ChunkInsertRow => {
      if (chunk.location.kind === "page") {
        return {
          chunkIndex: chunk.chunkIndex,
          sectionIndex: chunk.sectionIndex,

          content: chunk.content,
          contentHash: chunk.contentHash,

          characterCount: chunk.characterCount,

          estimatedTokenCount: chunk.estimatedTokenCount,

          locationKind: "page",
          pageNumber: chunk.location.pageNumber,
          sectionLabel: null,

          sourceStartOffset: chunk.sourceStartOffset,

          sourceEndOffset: chunk.sourceEndOffset,
        };
      }

      return {
        chunkIndex: chunk.chunkIndex,
        sectionIndex: chunk.sectionIndex,

        content: chunk.content,
        contentHash: chunk.contentHash,

        characterCount: chunk.characterCount,

        estimatedTokenCount: chunk.estimatedTokenCount,

        locationKind: "section",
        pageNumber: null,
        sectionLabel: chunk.location.label,

        sourceStartOffset: chunk.sourceStartOffset,

        sourceEndOffset: chunk.sourceEndOffset,
      };
    });

    const client = await this.database.connect();

    try {
      await client.query("BEGIN");

      await this.assertDocumentOwnership(
        client,
        input.documentId,
        input.ownerId,
      );

      /*
       * This makes verification and reprocessing
       * idempotent.
       *
       * Rerunning the same version replaces that
       * version's chunks instead of duplicating them.
       */
      await client.query(
        `
          DELETE FROM document_chunks
          WHERE document_id = $1
            AND owner_id = $2
            AND processing_version = $3
        `,
        [input.documentId, input.ownerId, input.processingVersion],
      );

      await client.query(
        `
          INSERT INTO document_chunks (
            document_id,
            owner_id,
            processing_version,

            chunk_index,
            section_index,

            content,
            content_hash,

            character_count,
            estimated_token_count,

            location_kind,
            page_number,
            section_label,

            source_start_offset,
            source_end_offset
          )
          SELECT
            $1,
            $2,
            $3,

            chunk_index,
            section_index,

            content,
            content_hash,

            character_count,
            estimated_token_count,

            location_kind,
            page_number,
            section_label,

            source_start_offset,
            source_end_offset
          FROM jsonb_to_recordset($4::jsonb)
          AS chunk_data (
            chunk_index INTEGER,
            section_index INTEGER,

            content TEXT,
            content_hash VARCHAR(64),

            character_count INTEGER,
            estimated_token_count INTEGER,

            location_kind VARCHAR(20),
            page_number INTEGER,
            section_label TEXT,

            source_start_offset INTEGER,
            source_end_offset INTEGER
          )
        `,
        [
          input.documentId,
          input.ownerId,
          input.processingVersion,
          JSON.stringify(
            rows.map((row) => ({
              chunk_index: row.chunkIndex,

              section_index: row.sectionIndex,

              content: row.content,

              content_hash: row.contentHash,

              character_count: row.characterCount,

              estimated_token_count: row.estimatedTokenCount,

              location_kind: row.locationKind,

              page_number: row.pageNumber,

              section_label: row.sectionLabel,

              source_start_offset: row.sourceStartOffset,

              source_end_offset: row.sourceEndOffset,
            })),
          ),
        ],
      );

      await client.query(
        `
          UPDATE documents
          SET
            chunk_count = $3,
            updated_at = NOW()
          WHERE id = $1
            AND owner_id = $2
        `,
        [input.documentId, input.ownerId, input.chunks.length],
      );

      await client.query("COMMIT");

      return input.chunks.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async assertDocumentOwnership(
    client: PoolClient,
    documentId: string,
    ownerId: string,
  ): Promise<void> {
    const result = await client.query<{
      id: string;
    }>(
      `
        SELECT id
        FROM documents
        WHERE id = $1
          AND owner_id = $2
        FOR UPDATE
      `,
      [documentId, ownerId],
    );

    if (!result.rows[0]) {
      throw new Error(
        `Document ${documentId} was not found for owner ${ownerId}.`,
      );
    }
  }

  async findWithoutEmbeddings(
    documentId: string,
    limit: number,
  ): Promise<ChunkAwaitingEmbedding[]> {
    const result = await this.database.query<{
      id: string;
      content: string;
    }>(
      `
        SELECT
          id,
          content
        FROM document_chunks
        WHERE document_id = $1
          AND embedding IS NULL
        ORDER BY chunk_index
        LIMIT $2
      `,
      [documentId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      content: row.content,
    }));
  }

  async saveEmbeddings(input: {
    model: string;
    items: ChunkEmbeddingUpdate[];
  }): Promise<void> {
    if (input.items.length === 0) {
      return;
    }

    const client = await this.database.connect();

    try {
      await client.query("BEGIN");

      for (const item of input.items) {
        const embedding = pgvector.toSql(item.embedding);

        const result = await client.query(
          `
            UPDATE document_chunks
            SET
              embedding = $2,
              embedding_model = $3,
              embedded_at = NOW()
            WHERE id = $1
          `,
          [item.chunkId, embedding, input.model],
        );

        if (result.rowCount !== 1) {
          throw new Error(
            `Could not save embedding for chunk ${item.chunkId}.`,
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");

      throw error;
    } finally {
      client.release();
    }
  }
}
