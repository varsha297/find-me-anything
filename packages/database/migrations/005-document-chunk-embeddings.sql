ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS embedding vector(1536);

ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100);

ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;