import cors from "cors";
import express from "express";

import { env } from "./config/env.ts";
import { documentRouter } from "./modules/documents/document.routes.ts";
import { searchRouter } from "./search/search.routes.js";
import { ragRouter } from "./rag/rag.routes.js";

export const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
  }),
);

app.use(express.json());

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
  });
});

app.use("/api/documents", documentRouter);

app.use("/api/search", searchRouter);

app.use("/api/ask", ragRouter);

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});
