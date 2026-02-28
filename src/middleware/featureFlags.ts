import type { NextFunction, Request, Response } from "express";
import { isFormCollabEnabled } from "../shared/config/config";

export const requireFormCollabEnabled = (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!isFormCollabEnabled()) {
    return res.status(404).json({ message: "Feature not found" });
  }

  return next();
};

