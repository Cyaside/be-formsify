import { Router } from "express";
import {
  deleteSection,
  updateSection,
} from "../controllers/sections.controller";
import { authRequired } from "../middleware/authRequired";
import { validateRequest } from "../middleware/validateRequest";
import { schemas } from "../validation/requestSchemas";

const router = Router();

router.put(
  "/:id",
  validateRequest({ params: schemas.idParams, body: schemas.updateSectionBody }),
  authRequired,
  updateSection,
);
router.delete(
  "/:id",
  validateRequest({ params: schemas.idParams, query: schemas.emptyQuery }),
  authRequired,
  deleteSection,
);

export default router;
