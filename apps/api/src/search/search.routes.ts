import { Router } from "express";

import { searchController } from "./search.dependencies.js";

export const searchRouter = Router();

searchRouter.post("/", searchController.search);
