import type { Response } from "express";
import { HttpServiceError } from "../errors/httpError";

export const respondHttpError = (
  res: Response,
  error: unknown,
): Response | null => {
  if (error instanceof HttpServiceError) {
    return res.status(error.status).json(error.payload);
  }
  return null;
};
