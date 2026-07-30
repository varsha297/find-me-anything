import { randomUUID } from "node:crypto";

import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { database } from "./database/client.js";

export const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));

const addRequestId: RequestHandler = (request, response, next) => {
  const requestId = request.header("x-request-id") ?? randomUUID();

  response.setHeader("x-request-id", requestId);

  next();
};

app.use(addRequestId);

app.get("/api/v1/health", async (_request, response, next) => {
  try {
    const result = await database.query<{
      database_time: Date;
    }>("SELECT NOW() AS database_time");

    response.status(200).json({
      status: "ok",
      service: "agentops-api",
      database: "connected",
      databaseTime: result.rows[0]?.database_time ?? null,
    });
  } catch (error) {
    next(error);
  }
});

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  console.error(error);

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
};

app.use(errorHandler);
