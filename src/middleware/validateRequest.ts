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
        const parsedParams = schemas.params(req.params, "params") as Request["params"];
        Object.keys(req.params).forEach((key) => {
          delete (req.params as Record<string, unknown>)[key];
        });
        Object.assign(req.params, parsedParams);
      }
      if (schemas.query) {
        const parsedQuery = schemas.query(req.query, "query") as Record<string, unknown>;
        const queryTarget = req.query as Record<string, unknown>;
        Object.keys(queryTarget).forEach((key) => {
          delete queryTarget[key];
        });
        Object.assign(queryTarget, parsedQuery);
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
