import { Router } from "express";
import { googleAuth, login, logout, me, register } from "./auth.controller";
import { authRequired } from "../../middleware/authRequired";
import { validateRequest } from "../../middleware/validateRequest";
import { schemas } from "../../shared/validation/requestSchemas";

const router = Router();

router.post("/register", validateRequest({ body: schemas.rootRegisterBody }), register);
router.post("/login", validateRequest({ body: schemas.rootLoginBody }), login);
router.post("/google", validateRequest({ body: schemas.googleAuthBody }), googleAuth);
router.get("/me", validateRequest({ query: schemas.emptyQuery }), authRequired, me);
router.post(
  "/logout",
  validateRequest({ query: schemas.emptyQuery, body: schemas.emptyBody }),
  authRequired,
  logout,
);

export default router;


