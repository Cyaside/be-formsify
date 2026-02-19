import { Router } from "express";
import { googleAuth, login, logout, me, register } from "../controllers/auth.controller";
import { authRequired } from "../middleware/authRequired";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/google", googleAuth);
router.get("/me", authRequired, me);
router.post("/logout", authRequired, logout);

export default router;
