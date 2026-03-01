import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE_NAME, getTokenFromAuthHeader } from "../shared/auth/auth";
import { isAllowedOrigin } from "../shared/security/origin";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const readHeaderValue = (value: string | string[] | undefined) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
};

const getRequestOrigin = (req: Request) => {
  const origin = readHeaderValue(req.headers.origin)?.trim();
  if (origin) return origin;

  const referer = readHeaderValue(req.headers.referer)?.trim();
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
};

export const createCsrfGuard = ({
  allowedOrigins,
}: {
  allowedOrigins: readonly string[];
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!UNSAFE_METHODS.has(req.method.toUpperCase())) {
      return next();
    }

    // Bearer token requests are not automatically attached by browsers,
    // so CSRF is not the primary threat model for this auth mode.
    const hasBearerAuth = Boolean(getTokenFromAuthHeader(req.headers.authorization));
    if (hasBearerAuth) {
      return next();
    }
    const hasAuthCookie =
      typeof req.cookies?.[AUTH_COOKIE_NAME] === "string" &&
      req.cookies[AUTH_COOKIE_NAME].trim().length > 0;

    const requestOrigin = getRequestOrigin(req);
    // Cookie-authenticated unsafe requests must present browser origin signal.
    // This closes a bypass path where forged requests omit Origin/Referer.
    if (!requestOrigin) {
      if (hasAuthCookie) {
        return res.status(403).json({
          message: "Blocked by CSRF protection: missing origin for cookie-auth request",
          code: "CSRF_MISSING_ORIGIN",
          hint: "Browser requests must include Origin/Referer and match CORS_ORIGIN.",
        });
      }
      return next();
    }

    if (!isAllowedOrigin(requestOrigin, allowedOrigins)) {
      return res.status(403).json({
        message: "Blocked by CSRF protection: request origin is not allowed",
        code: "CSRF_ORIGIN_NOT_ALLOWED",
        origin: requestOrigin,
        hint: "Add the frontend origin to CORS_ORIGIN on backend.",
      });
    }

    return next();
  };
};
