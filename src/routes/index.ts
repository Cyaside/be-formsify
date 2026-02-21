import { Router } from "express";
import authRouter from "./auth";
import analyticsRouter from "./analytics";
import formsRouter from "./forms";
import questionsRouter from "./questions";
import { login, register } from "../controllers/auth.controller";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.post("/register", register);
router.post("/login", login);

router.use("/api/auth", authRouter);
router.use("/api/analytics", analyticsRouter);
router.use("/api/forms", formsRouter);
router.use("/api/questions", questionsRouter);

export default router;
