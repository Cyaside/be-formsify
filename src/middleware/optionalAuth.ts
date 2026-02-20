import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE_NAME, getTokenFromAuthHeader, verifyToken } from "../lib/auth";

export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  const headerToken = getTokenFromAuthHeader(req.headers.authorization);
  const cookieToken =
    typeof req.cookies?.[AUTH_COOKIE_NAME] === "string"
      ? req.cookies[AUTH_COOKIE_NAME]
      : null;
  const token = headerToken ?? cookieToken;

  if (!token) {
    return next();
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.sub && typeof decoded.sub === "string") {
      req.user = { id: decoded.sub, email: String(decoded.email ?? "") };
    }
  } catch {
    req.user = undefined;
  }

  return next();
};
