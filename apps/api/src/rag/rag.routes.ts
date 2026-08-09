import { Router } from "express";

import { ragController } from "./rag.dependencies.js";

export const ragRouter = Router();

ragRouter.post("/", ragController.ask);
