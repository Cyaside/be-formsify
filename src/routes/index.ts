import { Router } from "express";
import authRouter from "./auth";
import analyticsRouter from "./analytics";
import formsRouter from "./forms";
import questionsRouter from "./questions";
import sectionsRouter from "./sections";
import { login, register } from "../controllers/auth.controller";
import { validateRequest } from "../middleware/validateRequest";
import { schemas } from "../validation/requestSchemas";

const router = Router();

router.get("/health", validateRequest({ query: schemas.emptyQuery }), (_req, res) => {
  res.json({ status: "ok" });
});

router.post("/register", validateRequest({ body: schemas.rootRegisterBody }), register);
router.post("/login", validateRequest({ body: schemas.rootLoginBody }), login);

router.use("/api/auth", authRouter);
router.use("/api/analytics", analyticsRouter);
router.use("/api/forms", formsRouter);
router.use("/api/questions", questionsRouter);
router.use("/api/sections", sectionsRouter);

export default router;
