import path from "node:path";

import { z } from "zod";

import { env } from "../../config/env.ts";
import { ALLOWED_DOCUMENT_TYPES } from "./document-upload.constants.ts";

const allowedMimeTypes = Object.keys(ALLOWED_DOCUMENT_TYPES) as [
  keyof typeof ALLOWED_DOCUMENT_TYPES,
  ...(keyof typeof ALLOWED_DOCUMENT_TYPES)[],
];

export const createUploadSessionSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1, "File name is required")
      .max(255, "File name is too long"),

    mimeType: z.enum(allowedMimeTypes),

    sizeBytes: z
      .number()
      .int()
      .positive("File must not be empty")
      .max(
        env.MAX_UPLOAD_SIZE_BYTES,
        `File must not exceed ${env.MAX_UPLOAD_SIZE_BYTES} bytes`,
      ),
  })
  .superRefine((value, context) => {
    const extension = path.extname(value.fileName).toLowerCase();

    const acceptedExtensions = ALLOWED_DOCUMENT_TYPES[value.mimeType];

    if (
      !acceptedExtensions.some(
        (allowedExtension) => allowedExtension === extension,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileName"],
        message: `The file extension does not match ${value.mimeType}`,
      });
    }
  });

export type CreateUploadSessionInput = z.infer<
  typeof createUploadSessionSchema
>;
