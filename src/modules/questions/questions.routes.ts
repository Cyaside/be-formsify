import { Router } from "express";
import { deleteQuestion, updateQuestion } from "./questions.controller";
import { authRequired } from "../../middleware/authRequired";
import { validateRequest } from "../../middleware/validateRequest";
import { schemas } from "../../shared/validation/requestSchemas";

const router = Router();

router.put(
  "/:id",
  validateRequest({ params: schemas.idParams, body: schemas.updateQuestionBody }),
  authRequired,
  updateQuestion,
);
router.delete(
  "/:id",
  validateRequest({ params: schemas.idParams, query: schemas.emptyQuery }),
  authRequired,
  deleteQuestion,
);

export default router;


