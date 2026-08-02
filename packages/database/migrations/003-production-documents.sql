CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,

  owner_id UUID NOT NULL,

  original_name TEXT NOT NULL,
  sanitized_name TEXT NOT NULL,

  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL
    CHECK (size_bytes > 0),

  checksum_sha256 TEXT,

  s3_bucket TEXT NOT NULL,
  s3_key TEXT NOT NULL UNIQUE,

  s3_version_id TEXT,
  s3_etag TEXT,

  upload_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      upload_status IN (
        'pending',
        'uploaded',
        'failed',
        'expired'
      )
    ),

  processing_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (
      processing_status IN (
        'not_started',
        'queued',
        'processing',
        'ready',
        'failed'
      )
    ),

  processing_attempts INTEGER NOT NULL DEFAULT 0,

  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,

  last_error_code TEXT,
  last_error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_documents_owner_created
  ON documents(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_upload_status
  ON documents(upload_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_processing_status
  ON documents(processing_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_s3_key
  ON documents(s3_key);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_set_updated_at
  ON documents;

CREATE TRIGGER documents_set_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();