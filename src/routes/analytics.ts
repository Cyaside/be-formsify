import { Router } from "express";
import { getGlobalAnalytics } from "../controllers/analytics.controller";
import { authRequired } from "../middleware/authRequired";

const router = Router();

router.get("/global", authRequired, getGlobalAnalytics);

export default router;
