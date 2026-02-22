import { Router } from "express";
import {
  deleteSection,
  updateSection,
} from "../controllers/sections.controller";
import { authRequired } from "../middleware/authRequired";

const router = Router();

router.put("/:id", authRequired, updateSection);
router.delete("/:id", authRequired, deleteSection);

export default router;
