import { Router } from "express";

import { env } from "../../config/env.ts";
import {
  createMultipleUploadSessionsSchema,
  createUploadSessionSchema,
} from "./document-upload.schema.ts";
import { createDocumentUploadSession } from "./document-upload.service.ts";
import { createMultipleDocumentUploadSessions } from "./document-multi-upload.service.ts";
import { pool as databasePool } from "../../database/pool.ts";
import { DocumentRepository } from "./document.repository.ts";

export const documentRouter = Router();
const documentRepository = new DocumentRepository(databasePool);
documentRouter.post("/upload-session", async (request, response, next) => {
  try {
    const validationResult = createUploadSessionSchema.safeParse(request.body);

    if (!validationResult.success) {
      response.status(400).json({
        error: {
          code: "INVALID_UPLOAD_REQUEST",
          message: "The upload request is invalid.",
          details: validationResult.error.flatten(),
        },
      });

      return;
    }

    const ownerId = env.LOCAL_DEV_USER_ID;

    const result = await createDocumentUploadSession(
      validationResult.data,
      ownerId,
    );

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

documentRouter.post("/upload-sessions", async (request, response, next) => {
  try {
    const validationResult = createMultipleUploadSessionsSchema.safeParse(
      request.body,
    );

    if (!validationResult.success) {
      response.status(400).json({
        error: {
          code: "INVALID_MULTIPLE_UPLOAD_REQUEST",
          message: "The multiple upload request is invalid.",
          details: validationResult.error.flatten(),
        },
      });

      return;
    }

    const ownerId = env.LOCAL_DEV_USER_ID;

    const result = await createMultipleDocumentUploadSessions(
      validationResult.data,
      ownerId,
    );

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

documentRouter.get("/:documentId/status", async (request, response, next) => {
  try {
    const documentId = request.params.documentId;

    if (!documentId) {
      response.status(400).json({
        error: {
          code: "DOCUMENT_ID_REQUIRED",
          message: "Document ID is required.",
        },
      });

      return;
    }

    const ownerId = env.LOCAL_DEV_USER_ID;

    const document = await documentRepository.findProcessingStatus(
      documentId,
      ownerId,
    );

    if (!document) {
      response.status(404).json({
        error: {
          code: "DOCUMENT_NOT_FOUND",
          message: "Document was not found.",
        },
      });

      return;
    }

    response.status(200).json(document);
  } catch (error) {
    next(error);
  }
});
documentRouter.get("/test", (_request, response) => {
  response.json({
    message: "Document router is working",
  });
});
