import { Router } from "express";

import { env } from "../../config/env.ts";
import { createUploadSessionSchema } from "./document-upload.schema.ts";
import { createDocumentUploadSession } from "./document-upload.service.ts";

export const documentRouter = Router();

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

documentRouter.get("/test", (_request, response) => {
  response.json({
    message: "Document router is working",
  });
});
