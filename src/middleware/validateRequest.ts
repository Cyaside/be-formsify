import type { NextFunction, Request, Response } from "express";
import { RequestValidationError, type Parser } from "../lib/requestValidation";

type RequestSchemas = {
  params?: Parser<Record<string, unknown>>;
  query?: Parser<Record<string, unknown>>;
  body?: Parser<Record<string, unknown>>;
};

export const validateRequest = (schemas: RequestSchemas) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        // Express 5 may expose params/query objects with internal invariants.
        // Validate them without mutating the original request object.
        schemas.params(req.params, "params");
      }
      if (schemas.query) {
        schemas.query(req.query, "query");
      }
      if (schemas.body) {
        const rawBody = req.body === undefined ? {} : req.body;
        req.body = schemas.body(rawBody, "body");
      }
      return next();
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return res.status(400).json({
          message: error.message,
          errors: error.issues,
        });
      }
      return next(error);
    }
  };
};
