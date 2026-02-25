import type { CookieOptions, Response } from "express";
import { AUTH_COOKIE_NAME, TOKEN_MAX_AGE_MS } from "./auth";

const unwrapEnvString = (value: string | undefined) => {
  if (!value) return value;
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const toBoolean = (value: string | undefined) => {
  const normalized = unwrapEnvString(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
};

const getSameSite = (): CookieOptions["sameSite"] => {
  const configured = unwrapEnvString(process.env.AUTH_COOKIE_SAME_SITE)?.toLowerCase();
  if (configured === "lax" || configured === "strict" || configured === "none") {
    return configured;
  }
  // On Railway, FE/BE are often on different domains, so cookies must be cross-site.
  return process.env.NODE_ENV === "production" ? "none" : "lax";
};

const getBaseAuthCookieOptions = (): CookieOptions => {
  const sameSite = getSameSite();
  const secureOverride = toBoolean(process.env.AUTH_COOKIE_SECURE);
  const secure =
    secureOverride ?? (process.env.NODE_ENV === "production" || sameSite === "none");
  const domain = unwrapEnvString(process.env.AUTH_COOKIE_DOMAIN) || undefined;

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: "/",
    ...(domain ? { domain } : {}),
  };
};

export const setAuthCookie = (res: Response, token: string) => {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...getBaseAuthCookieOptions(),
    maxAge: TOKEN_MAX_AGE_MS,
  });
};

export const clearAuthCookie = (res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME, getBaseAuthCookieOptions());
};
