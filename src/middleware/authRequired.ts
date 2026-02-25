import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE_NAME, getTokenFromAuthHeader, verifyToken } from "../shared/auth/auth";

export const authRequired = (req: Request, res: Response, next: NextFunction) => {
  const headerToken = getTokenFromAuthHeader(req.headers.authorization);
  const cookieToken =
    typeof req.cookies?.[AUTH_COOKIE_NAME] === "string"
      ? req.cookies[AUTH_COOKIE_NAME]
      : null;
  const token = headerToken ?? cookieToken;

  if (!token) {
    return res.status(401).json({ message: "Missing authentication token" });
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded.sub || typeof decoded.sub !== "string") {
      return res.status(401).json({ message: "Invalid token payload" });
    }
    req.user = { id: decoded.sub, email: String(decoded.email ?? "") };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

