CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    document_id UUID NOT NULL
        REFERENCES documents(id)
        ON DELETE CASCADE,

    owner_id UUID NOT NULL,

    processing_version INTEGER NOT NULL DEFAULT 1,

    chunk_index INTEGER NOT NULL,
    section_index INTEGER NOT NULL,

    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,

    character_count INTEGER NOT NULL,
    estimated_token_count INTEGER NOT NULL,

    location_kind VARCHAR(20) NOT NULL,

    page_number INTEGER,
    section_label TEXT,

    source_start_offset INTEGER NOT NULL,
    source_end_offset INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT document_chunks_unique_chunk
        UNIQUE (
            document_id,
            processing_version,
            chunk_index
        ),

    CONSTRAINT document_chunks_location_kind_check
        CHECK (
            location_kind IN (
                'page',
                'section'
            )
        ),

    CONSTRAINT document_chunks_location_check
        CHECK (
            (
                location_kind = 'page'
                AND page_number IS NOT NULL
                AND section_label IS NULL
            )
            OR
            (
                location_kind = 'section'
                AND page_number IS NULL
                AND section_label IS NOT NULL
            )
        ),

    CONSTRAINT document_chunks_character_count_check
        CHECK (character_count > 0),

    CONSTRAINT document_chunks_token_count_check
        CHECK (estimated_token_count > 0),

    CONSTRAINT document_chunks_source_offsets_check
        CHECK (
            source_start_offset >= 0
            AND source_end_offset > source_start_offset
        )
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document
    ON document_chunks (
        document_id,
        processing_version,
        chunk_index
    );

CREATE INDEX IF NOT EXISTS idx_document_chunks_owner
    ON document_chunks (
        owner_id,
        document_id
    );

CREATE INDEX IF NOT EXISTS idx_document_chunks_content_hash
    ON document_chunks (
        content_hash
    );