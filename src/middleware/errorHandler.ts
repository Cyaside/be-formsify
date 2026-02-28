import type { NextFunction, Request, Response } from "express";

export const errorHandler = (
  err: Error & { status?: number; type?: string; code?: string; origin?: string; hint?: string },
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ message: "Invalid JSON body" });
  }

  if (typeof err.status === "number" && err.status >= 400 && err.status < 600) {
    return res.status(err.status).json({
      message: err.message || "Request rejected",
      ...(err.code ? { code: err.code } : {}),
      ...(err.origin ? { origin: err.origin } : {}),
      ...(err.hint ? { hint: err.hint } : {}),
    });
  }

  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
};
