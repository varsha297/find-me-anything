export const ALLOWED_DOCUMENT_TYPES = {
  "application/pdf": [".pdf"],

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],

  "text/plain": [".txt"],
} as const;

export type AllowedDocumentMimeType = keyof typeof ALLOWED_DOCUMENT_TYPES;
