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
import {
  deleteResponse,
  getSummary,
  listResponses,
} from "../controllers/responses.controller";
import {
  createSection,
  listSections,
} from "../controllers/sections.controller";
import { submitForm } from "../controllers/submissions.controller";
import { authRequired } from "../middleware/authRequired";
import { optionalAuth } from "../middleware/optionalAuth";

const router = Router();

router.get("/public", listPublicForms);
router.get("/", authRequired, listForms);
router.get("/:id", optionalAuth, getForm);
router.get("/:id/questions", optionalAuth, listQuestions);
router.get("/:id/sections", optionalAuth, listSections);
router.get("/:id/responses", authRequired, listResponses);
router.get("/:id/summary", authRequired, getSummary);
router.delete("/:id/responses/:responseId", authRequired, deleteResponse);
router.post("/", authRequired, createForm);
router.post("/:id/questions", authRequired, createQuestion);
router.post("/:id/sections", authRequired, createSection);
router.post("/:id/submit", submitForm);
router.put("/:id", authRequired, updateForm);
router.delete("/:id", authRequired, deleteForm);

export default router;
