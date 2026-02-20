import { Router } from "express";
import {
  createForm,
  deleteForm,
  getForm,
  listForms,
  listPublicForms,
  updateForm,
} from "../controllers/forms.controller";
import { createQuestion, listQuestions } from "../controllers/questions.controller";
import { getSummary, listResponses } from "../controllers/responses.controller";
import { submitForm } from "../controllers/submissions.controller";
import { authRequired } from "../middleware/authRequired";

const router = Router();

router.get("/public", listPublicForms);
router.get("/", authRequired, listForms);
router.get("/:id", getForm);
router.get("/:id/questions", listQuestions);
router.get("/:id/responses", authRequired, listResponses);
router.get("/:id/summary", authRequired, getSummary);
router.post("/", authRequired, createForm);
router.post("/:id/questions", authRequired, createQuestion);
router.post("/:id/submit", submitForm);
router.put("/:id", authRequired, updateForm);
router.delete("/:id", authRequired, deleteForm);

export default router;
