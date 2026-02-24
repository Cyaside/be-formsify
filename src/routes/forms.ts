import { Router } from "express";
import {
  createCollaborator,
  deleteCollaborator,
  listCollaborators,
  updateCollaborator,
} from "../controllers/collaborators.controller";
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
  getResponseDetail,
  getSummary,
  listResponses,
} from "../controllers/responses.controller";
import {
  createSection,
  listSections,
} from "../controllers/sections.controller";
import { submitForm } from "../controllers/submissions.controller";
import { authRequired } from "../middleware/authRequired";
import { requireFormCollabEnabled } from "../middleware/featureFlags";
import { optionalAuth } from "../middleware/optionalAuth";
import { validateRequest } from "../middleware/validateRequest";
import { schemas } from "../validation/requestSchemas";

const router = Router();

router.get("/public", validateRequest({ query: schemas.listPublicFormsQuery }), listPublicForms);
router.get("/", validateRequest({ query: schemas.listFormsQuery }), authRequired, listForms);
router.get(
  "/:id",
  validateRequest({ params: schemas.idParams, query: schemas.emptyQuery }),
  optionalAuth,
  getForm,
);
router.get(
  "/:id/questions",
  validateRequest({ params: schemas.idParams, query: schemas.emptyQuery }),
  optionalAuth,
  listQuestions,
);
router.get(
  "/:id/sections",
  validateRequest({ params: schemas.idParams, query: schemas.emptyQuery }),
  optionalAuth,
  listSections,
);
router.get(
  "/:id/responses",
  validateRequest({ params: schemas.idParams, query: schemas.paginationQuery }),
  authRequired,
  listResponses,
);
router.get(
  "/:id/responses/:responseId",
  validateRequest({ params: schemas.idAndResponseParams, query: schemas.emptyQuery }),
  authRequired,
  getResponseDetail,
);
router.get(
  "/:id/summary",
  validateRequest({ params: schemas.idParams, query: schemas.emptyQuery }),
  authRequired,
  getSummary,
);
router.delete(
  "/:id/responses/:responseId",
  validateRequest({ params: schemas.idAndResponseParams, query: schemas.emptyQuery }),
  authRequired,
  deleteResponse,
);
router.post("/", validateRequest({ body: schemas.createFormBody }), authRequired, createForm);
router.post(
  "/:id/questions",
  validateRequest({ params: schemas.idParams, body: schemas.createQuestionBody }),
  authRequired,
  createQuestion,
);
router.post(
  "/:id/sections",
  validateRequest({ params: schemas.idParams, body: schemas.createSectionBody }),
  authRequired,
  createSection,
);
router.get(
  "/:id/collaborators",
  validateRequest({ params: schemas.idParams, query: schemas.emptyQuery }),
  authRequired,
  requireFormCollabEnabled,
  listCollaborators,
);
router.post(
  "/:id/collaborators",
  validateRequest({ params: schemas.idParams, body: schemas.createCollaboratorBody }),
  authRequired,
  requireFormCollabEnabled,
  createCollaborator,
);
router.patch(
  "/:id/collaborators/:userId",
  validateRequest({ params: schemas.idAndUserIdParams, body: schemas.updateCollaboratorBody }),
  authRequired,
  requireFormCollabEnabled,
  updateCollaborator,
);
router.delete(
  "/:id/collaborators/:userId",
  validateRequest({ params: schemas.idAndUserIdParams, query: schemas.emptyQuery }),
  authRequired,
  requireFormCollabEnabled,
  deleteCollaborator,
);
router.post(
  "/:id/submit",
  validateRequest({ params: schemas.idParams, body: schemas.submitFormBody }),
  submitForm,
);
router.put(
  "/:id",
  validateRequest({ params: schemas.idParams, body: schemas.updateFormBody }),
  authRequired,
  updateForm,
);
router.delete(
  "/:id",
  validateRequest({ params: schemas.idParams, query: schemas.emptyQuery }),
  authRequired,
  deleteForm,
);

export default router;
