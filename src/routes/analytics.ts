import { Router } from "express";
import { getGlobalAnalytics } from "../controllers/analytics.controller";
import { authRequired } from "../middleware/authRequired";
import { validateRequest } from "../middleware/validateRequest";
import { schemas } from "../validation/requestSchemas";

const router = Router();

router.get(
  "/global",
  validateRequest({ query: schemas.analyticsQuery }),
  authRequired,
  getGlobalAnalytics,
);

export default router;
