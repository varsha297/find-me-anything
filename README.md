# FindAnything

FindAnything is a full-stack document search and RAG application that allows users to upload documents, process them asynchronously, generate embeddings, store them in PostgreSQL using pgvector, and ask questions across all indexed documents.

The system is designed around a production-style asynchronous architecture using React/Next.js, Node.js, PostgreSQL, AWS S3, SQS, OpenAI embeddings, and Retrieval-Augmented Generation.

---

## Features

- Single document upload
- Multiple document upload
- Direct browser-to-S3 upload using presigned POST requests
- Asynchronous document processing using S3 events and SQS
- Background Node.js worker
- PDF text extraction
- Text chunking with overlap
- OpenAI embedding generation
- PostgreSQL + pgvector vector storage
- Semantic search across all indexed documents
- Retrieval-Augmented Generation
- Source document and page references
- Processing status tracking
- Duplicate event protection
- Retry-safe SQS processing
- Multi-user-ready data model using `owner_id`

---

# Architecture

```text
                         FindAnything

┌───────────────────────────────────────────────────────────┐
│                         Frontend                          │
│                    Next.js / React                       │
│                                                           │
│    Upload Documents              Ask FindAnything         │
└──────────────┬──────────────────────────┬─────────────────┘
               │                          │
               │ metadata                 │ question
               ▼                          ▼
┌───────────────────────────────────────────────────────────┐
│                       Node.js API                         │
│                                                           │
│ POST /api/documents/upload-session                       │
│ POST /api/documents/upload-sessions                      │
│ GET  /api/documents/:id/status                           │
│ POST /api/search                                         │
│ POST /api/ask                                            │
└──────────────┬──────────────────────────┬─────────────────┘
               │                          │
               │                          │
               ▼                          ▼
        PostgreSQL + pgvector       OpenAI Embeddings
               ▲                          │
               │                          │
               │                          ▼
               │                    Vector Search
               │
               │
Frontend ───────────────► Amazon S3
                           │
                           │ ObjectCreated Event
                           ▼
                      Amazon SQS
                           │
                           ▼
                    Background Worker
                           │
               ┌───────────┴───────────┐
               │                       │
               ▼                       ▼
          Download from S3        PostgreSQL
               │
               ▼
        Extract document text
               │
               ▼
             Chunk
               │
               ▼
       Generate embeddings
               │
               ▼
         Store in pgvector
```

---

# Document Upload Flow

The actual document bytes do not pass through the Node.js API.

The browser first sends only document metadata to the backend:

```text
fileName
mimeType
sizeBytes
```

The API:

1. Creates a document ID.
2. Creates the S3 object key.
3. Stores document metadata in PostgreSQL.
4. Generates a presigned S3 POST.
5. Returns the upload information to the frontend.

The browser then uploads the actual file directly to Amazon S3.

```text
Browser
   │
   │ metadata
   ▼
Node API
   │
   │ presigned POST
   ▼
Browser
   │
   │ actual PDF bytes
   ▼
Amazon S3
```

This prevents large files from consuming Node.js API memory and bandwidth.

---

# Background Processing Flow

After S3 receives the uploaded file:

```text
S3 ObjectCreated
       ↓
      SQS
       ↓
     Worker
```

The worker:

1. Receives the SQS message.
2. Finds the corresponding PostgreSQL document.
3. Atomically claims the document for processing.
4. Downloads the file from S3.
5. Extracts text.
6. Splits the text into chunks.
7. Stores chunks in PostgreSQL.
8. Generates embeddings.
9. Stores embeddings in pgvector.
10. Marks the document as ready.
11. Deletes the SQS message.

Example:

```text
PDF
 ↓
PDF.js
 ↓
Extracted text
 ↓
Chunker
 ↓
document_chunks
 ↓
text-embedding-3-small
 ↓
1536-dimensional vector
 ↓
pgvector
 ↓
READY
```

---

# Processing Status

Documents move through processing states such as:

```text
not_started
queued
processing
ready
failed
```

Processing steps include:

```text
downloading
extracting
chunking
storing
embedding
completed
```

The frontend can query:

```http
GET /api/documents/:documentId/status
```

Example response:

```json
{
  "id": "33643fe8-ac91-467b-b56f-4091ea82dd8b",
  "uploadStatus": "uploaded",
  "processingStatus": "ready",
  "processingStep": "completed",
  "chunkCount": 7,
  "processingError": null
}
```

---

# Semantic Search

FindAnything supports semantic search rather than only keyword matching.

Example question:

```text
How does React rendering work?
```

The API:

```text
Question
   ↓
text-embedding-3-small
   ↓
1536-dimensional query vector
   ↓
pgvector
   ↓
cosine similarity search
   ↓
top matching chunks
```

The query embedding and document embeddings use the same embedding model.

---

# RAG Flow

FindAnything uses Retrieval-Augmented Generation.

```text
User question
       ↓
Generate query embedding
       ↓
pgvector semantic search
       ↓
Retrieve top document chunks
       ↓
Send question + chunks to LLM
       ↓
Generate grounded answer
       ↓
Return answer + sources
```

The LLM is instructed to answer from the retrieved document context rather than relying on unrelated external knowledge.

Source metadata such as:

```text
documentName
pageNumber
documentId
chunkId
```

comes directly from PostgreSQL rather than being invented by the model.

---

# Search Across All Documents

The Ask section is independent of document upload.

Users can ask questions at any time across all documents that have already reached:

```text
processing_status = ready
```

For example:

```text
A.pdf → ready
B.pdf → ready
C.pdf → currently processing
```

A search will use:

```text
A.pdf
B.pdf
```

and temporarily ignore:

```text
C.pdf
```

Once `C.pdf` becomes ready, it automatically participates in future searches.

This allows uploads and search to operate independently.

---

# Technology Stack

## Frontend

- Next.js
- React
- TypeScript
- Browser `File` API
- `FormData`
- Direct S3 uploads

## Backend API

- Node.js
- Express
- TypeScript
- Zod
- PostgreSQL
- `pg`
- AWS SDK
- OpenAI SDK
- pgvector Node package

## Worker

- Node.js
- TypeScript
- AWS SQS
- AWS S3
- PDF.js
- OpenAI Embeddings
- PostgreSQL
- pgvector

## Infrastructure

- Amazon S3
- Amazon SQS
- Amazon ECR
- Docker
- PostgreSQL
- pgvector

---

# Repository Structure

```text
find-me-anything/
│
├── apps/
│   │
│   ├── api/
│   │   └── src/
│   │       ├── config/
│   │       ├── database/
│   │       ├── embeddings/
│   │       ├── modules/
│   │       │   └── documents/
│   │       ├── rag/
│   │       └── search/
│   │
│   ├── worker/
│   │   └── src/
│   │       ├── chunking/
│   │       ├── config/
│   │       ├── database/
│   │       ├── embeddings/
│   │       ├── events/
│   │       ├── extraction/
│   │       ├── processors/
│   │       ├── queue/
│   │       ├── repositories/
│   │       └── storage/
│   │
│   └── web/
│       └── src/
│           ├── components/
│           └── lib/
│
├── packages/
│   └── database/
│       └── migrations/
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

# Database

The main tables are:

## `documents`

Stores document metadata and processing state.

Important fields include:

```text
id
owner_id
original_name
mime_type
size_bytes
s3_bucket
s3_key
upload_status
processing_status
processing_step
processing_version
chunk_count
page_count
processing_error
processed_at
```

## `document_chunks`

Stores extracted chunks and vector embeddings.

Important fields include:

```text
id
document_id
owner_id
chunk_index
content
page_number
processing_version
embedding
embedding_model
embedded_at
```

The embedding column uses:

```sql
vector(1536)
```

The pgvector extension is enabled using a migration.

---

# Database Migrations

Database schema changes are managed through SQL migrations.

Example:

```text
packages/database/migrations/
```

Relevant migrations include:

```text
004-enable-pgvector.sql
005-document-chunk-embeddings.sql
```

Example:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

and:

```sql
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS embedding vector(1536);
```

The migration runner tracks applied migrations using:

```text
schema_migrations
```

---

# Environment Variables

## API

Example:

```env
NODE_ENV=development
PORT=4000

DATABASE_URL=postgresql://...

CORS_ORIGIN=http://localhost:3000

LOCAL_DEV_USER_ID=11111111-1111-4111-8111-111111111111

AWS_REGION=eu-north-1

S3_BUCKET_NAME=findanything-s3-bucket

OPENAI_API_KEY=...
```

## Worker

Example:

```env
DATABASE_URL=postgresql://...

AWS_REGION=eu-north-1

S3_BUCKET_NAME=findanything-s3-bucket

SQS_DOCUMENT_PROCESSING_QUEUE_URL=...

WORKER_ENABLED=true

OPENAI_API_KEY=...
```

## Frontend

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

Never expose:

```text
OPENAI_API_KEY
AWS_SECRET_ACCESS_KEY
database credentials
```

through `NEXT_PUBLIC_*`.

---

# Local Development

## Install dependencies

```bash
pnpm install
```

---

## Start PostgreSQL

Start the local Docker environment.

Example:

```bash
docker compose up -d
```

Local PostgreSQL is exposed using:

```text
localhost:5433
```

while PostgreSQL inside the container uses:

```text
5432
```

---

## Run migrations

Run the API migration command configured in the repository.

The migration runner:

- reads SQL migrations
- applies them in order
- records successful migrations
- uses transactions
- uses an advisory lock
- rolls back failed migrations

---

# Start API

```bash
pnpm --filter @findanything/api dev
```

Default API:

```text
http://localhost:4000
```

---

# Start Worker

```bash
pnpm --filter @findanything/worker start
```

Make sure:

```env
WORKER_ENABLED=true
```

Expected output:

```text
SQS worker started.
```

---

# Start Frontend

```bash
pnpm --filter @findanything/web dev
```

Use the actual workspace package name if it differs.

---

# API Endpoints

## Create single upload session

```http
POST /api/documents/upload-session
```

Example:

```json
{
  "fileName": "React.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 500000
}
```

---

## Create multiple upload sessions

```http
POST /api/documents/upload-sessions
```

Example:

```json
{
  "files": [
    {
      "fileName": "React.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 500000
    },
    {
      "fileName": "Node.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 700000
    }
  ]
}
```

---

## Get processing status

```http
GET /api/documents/:documentId/status
```

---

## Semantic search

```http
POST /api/search
```

Example:

```json
{
  "query": "How does React reconciliation work?",
  "limit": 5
}
```

This endpoint returns raw matching chunks and is useful for debugging retrieval quality.

---

## Ask FindAnything

```http
POST /api/ask
```

Search across all ready documents:

```json
{
  "question": "What do my documents say about React hooks?"
}
```

Optionally search one document:

```json
{
  "question": "What does this document say about React hooks?",
  "documentId": "33643fe8-ac91-467b-b56f-4091ea82dd8b"
}
```

Example response:

```json
{
  "question": "What do my documents say about React hooks?",
  "answer": "The documents describe...",
  "sources": [
    {
      "chunkId": "...",
      "documentId": "...",
      "documentName": "Front_End_Topics.pdf",
      "pageNumber": 3,
      "similarity": 0.81
    }
  ]
}
```

---

# SQS Reliability

Amazon SQS provides asynchronous processing between S3 and the worker.

Important behavior:

```text
Worker OFF
   ↓
messages remain in SQS
   ↓
worker starts later
   ↓
messages are processed
```

Messages are deleted only after successful document processing.

If processing fails:

```text
worker throws error
      ↓
SQS message is NOT deleted
      ↓
visibility timeout expires
      ↓
message becomes available again
```

Repeated failures can eventually move to the configured Dead Letter Queue.

---

# Duplicate Processing Protection

S3/SQS delivery should be treated as at-least-once delivery.

The worker atomically claims a document before processing.

Possible results:

```text
claimed
already-ready
busy
```

This prevents multiple workers from processing the same document simultaneously.

---

# Security

Current development uses:

```text
LOCAL_DEV_USER_ID
```

for local user simulation.

Production authentication should replace this with the authenticated user's ID.

All search queries are scoped using:

```text
owner_id
```

to prevent retrieving chunks belonging to another user.

---

# Current Limitations

The current version intentionally focuses on the core end-to-end RAG architecture.

Some advanced functionality is postponed.

## PDF extraction quality

Some PDFs may contain unusual embedded fonts or broken Unicode character mappings.

This can cause text such as:

```text
React Router
```

to extract incorrectly.

OCR fallback is planned for a future version.

## DOCX processing

Upload support may exist before extraction support is fully implemented in the worker.

Extractor capabilities should be expanded independently from upload capabilities.

## Search quality

Current retrieval uses vector similarity search.

Future improvements may include:

- hybrid vector + keyword search
- reranking
- query rewriting
- context expansion
- neighboring chunk retrieval
- similarity thresholds
- retrieval evaluation

## Vector indexing

Exact nearest-neighbor search is currently sufficient for development.

As the number of chunks grows, an HNSW pgvector index can be introduced after benchmarking.

---

# Planned Improvements

```text
OCR fallback
SSE answer streaming
Authentication
Document library UI
Document delete/re-index
Search filters
Hybrid search
Reranking
HNSW indexing
Conversation history
Citation navigation
Observability
Structured logging
Metrics
Tracing
Production deployment
```

---

# Key Design Decisions

## Why direct S3 upload?

The Node.js API does not need to proxy large file bytes.

Advantages:

- lower API memory usage
- lower API bandwidth
- easier horizontal scaling
- better large-file handling
- browser communicates directly with object storage

## Why SQS?

Document extraction and embedding generation are slow background operations.

They should not block an HTTP request.

SQS decouples:

```text
upload
```

from:

```text
processing
```

## Why pgvector?

It allows PostgreSQL to store application data and vector embeddings together.

This keeps the initial architecture simple while still supporting semantic search.

## Why separate API and worker?

The API handles synchronous user requests.

The worker handles asynchronous CPU/network-heavy background processing.

```text
API
→ request/response

Worker
→ background jobs
```

## Why embeddings before the LLM?

Embeddings solve:

```text
"What information is relevant?"
```

The LLM solves:

```text
"How should I explain that information?"
```

They perform different jobs.

---

# End-to-End Flow

```text
User selects PDF
        ↓
Frontend requests upload session
        ↓
Node API stores metadata
        ↓
Node API returns presigned S3 POST
        ↓
Browser uploads bytes directly to S3
        ↓
S3 emits ObjectCreated event
        ↓
SQS stores event
        ↓
Worker receives event
        ↓
Worker downloads PDF
        ↓
PDF.js extracts text
        ↓
Text is chunked
        ↓
Chunks stored in PostgreSQL
        ↓
OpenAI creates embeddings
        ↓
Vectors stored using pgvector
        ↓
Document marked READY

────────────────────────────────────

User asks a question
        ↓
Node API embeds the question
        ↓
pgvector finds semantically similar chunks
        ↓
Relevant chunks + question sent to LLM
        ↓
LLM generates grounded answer
        ↓
API returns answer + source metadata
        ↓
React displays the result
```

---

# Project Goal

FindAnything is not intended to be only a "chat with one PDF" application.

The goal is to build a personal searchable knowledge base where users continuously upload documents and can search across everything they have indexed.

```text
Documents
   ↓
Knowledge Base
   ↓
Ask Anything
   ↓
Semantic Retrieval
   ↓
Grounded Answer
```

The upload pipeline and Ask experience therefore operate independently.

Users can continue asking questions across existing ready documents while additional files are being uploaded and processed in the background.
