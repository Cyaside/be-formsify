import { Router } from "express";
import { deleteQuestion, updateQuestion } from "../controllers/questions.controller";
import { authRequired } from "../middleware/authRequired";

const router = Router();

router.put("/:id", authRequired, updateQuestion);
router.delete("/:id", authRequired, deleteQuestion);

export default router;
