import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE_NAME, getTokenFromAuthHeader, verifyToken } from "../lib/auth";

type WindowCounter = {
  count: number;
  resetAt: number;
};

type RateLimitPolicy = {
  windowMs: number;
  ipLimit: number;
  identityLimit?: number;
  name: string;
};

const counters = new Map<string, WindowCounter>();

const DEFAULT_POLICY: RateLimitPolicy = {
  name: "default",
  windowMs: 60_000,
  ipLimit: 120,
  identityLimit: 240,
};

const AUTH_POLICY: RateLimitPolicy = {
  name: "auth",
  windowMs: 10 * 60_000,
  ipLimit: 30,
  identityLimit: 20,
};

const SUBMIT_POLICY: RateLimitPolicy = {
  name: "submit",
  windowMs: 5 * 60_000,
  ipLimit: 60,
  identityLimit: 120,
};

const DOCS_POLICY: RateLimitPolicy = {
  name: "docs",
  windowMs: 60_000,
  ipLimit: 300,
  identityLimit: 500,
};

let cleanupCounter = 0;

const nowMs = () => Date.now();
const DYNAMIC_SEGMENT_REGEX = /^[A-Za-z0-9_-]{8,}$/;

const getClientIp = (req: Request) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return String(ip);
};

const getAuthenticatedIdentity = (req: Request) => {
  const headerToken = getTokenFromAuthHeader(req.headers.authorization);
  const cookieToken =
    typeof req.cookies?.[AUTH_COOKIE_NAME] === "string"
      ? (req.cookies[AUTH_COOKIE_NAME] as string)
      : null;
  const token = headerToken ?? cookieToken;
  if (!token) return null;

  try {
    const decoded = verifyToken(token);
    return typeof decoded.sub === "string" && decoded.sub ? `user:${decoded.sub}` : null;
  } catch {
    return null;
  }
};

const getCredentialIdentity = (req: Request) => {
  const method = req.method.toUpperCase();
  if (method !== "POST") return null;

  const route = req.path.toLowerCase();
  if (!route.endsWith("/login") && !route.endsWith("/register")) {
    return null;
  }

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const email = (body as Record<string, unknown>).email;
  if (typeof email !== "string") {
    return null;
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return `cred:${normalized}`;
};

const getIdentityKey = (req: Request) => getAuthenticatedIdentity(req) ?? getCredentialIdentity(req);

const getPolicy = (req: Request): RateLimitPolicy => {
  const path = req.path.toLowerCase();
  if (path === "/health" || path.startsWith("/api-docs")) {
    return DOCS_POLICY;
  }
  if (
    path === "/login" ||
    path === "/register" ||
    path.startsWith("/api/auth/login") ||
    path.startsWith("/api/auth/register") ||
    path.startsWith("/api/auth/google")
  ) {
    return AUTH_POLICY;
  }
  if (req.method.toUpperCase() === "POST" && path.includes("/submit")) {
    return SUBMIT_POLICY;
  }
  return DEFAULT_POLICY;
};

const normalizePathForRateLimit = (path: string) => {
  if (!path || path === "/") return "/";
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const lower = segment.toLowerCase();
      if (/^\d+$/.test(segment)) return ":id";
      if (DYNAMIC_SEGMENT_REGEX.test(segment)) return ":id";
      if (lower.length > 64) return ":segment";
      return lower;
    });
  return `/${segments.join("/")}`;
};

const consume = (key: string, limit: number, windowMs: number) => {
  const now = nowMs();
  const current = counters.get(key);

  if (!current || current.resetAt <= now) {
    const next: WindowCounter = { count: 1, resetAt: now + windowMs };
    counters.set(key, next);
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetAt: next.resetAt,
      retryAfterSeconds: 0,
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  counters.set(key, current);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    retryAfterSeconds: 0,
  };
};

const maybeCleanup = () => {
  cleanupCounter += 1;
  if (cleanupCounter % 500 !== 0) return;

  const now = nowMs();
  for (const [key, counter] of counters.entries()) {
    if (counter.resetAt <= now) {
      counters.delete(key);
    }
  }
};

export const rateLimitAllRequests = (req: Request, res: Response, next: NextFunction) => {
  maybeCleanup();

  const policy = getPolicy(req);
  const routeKey = `${req.method.toUpperCase()}:${normalizePathForRateLimit(
    `${req.baseUrl}${req.path}`,
  )}`;
  const ipKey = `${policy.name}:${routeKey}:ip:${getClientIp(req)}`;
  const ipResult = consume(ipKey, policy.ipLimit, policy.windowMs);
  if (!ipResult.allowed) {
    res.setHeader("Retry-After", String(ipResult.retryAfterSeconds));
    res.setHeader("X-RateLimit-Limit", String(ipResult.limit));
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", String(Math.floor(ipResult.resetAt / 1000)));
    return res.status(429).json({
      message: "Too many requests. Please retry later.",
      code: "RATE_LIMITED",
      retryAfterSeconds: ipResult.retryAfterSeconds,
      scope: "ip",
    });
  }

  let userHeaders = {
    limit: ipResult.limit,
    remaining: ipResult.remaining,
    resetAt: ipResult.resetAt,
  };

  if (policy.identityLimit) {
    const identity = getIdentityKey(req);
    if (identity) {
      const identityKey = `${policy.name}:${routeKey}:identity:${identity}`;
      const identityResult = consume(identityKey, policy.identityLimit, policy.windowMs);
      if (!identityResult.allowed) {
        res.setHeader("Retry-After", String(identityResult.retryAfterSeconds));
        res.setHeader("X-RateLimit-Limit", String(identityResult.limit));
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", String(Math.floor(identityResult.resetAt / 1000)));
        return res.status(429).json({
          message: "Too many requests for this account. Please retry later.",
          code: "RATE_LIMITED",
          retryAfterSeconds: identityResult.retryAfterSeconds,
          scope: "identity",
        });
      }
      userHeaders = {
        limit: identityResult.limit,
        remaining: Math.min(ipResult.remaining, identityResult.remaining),
        resetAt: Math.max(ipResult.resetAt, identityResult.resetAt),
      };
    }
  }

  res.setHeader("X-RateLimit-Limit", String(userHeaders.limit));
  res.setHeader("X-RateLimit-Remaining", String(userHeaders.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.floor(userHeaders.resetAt / 1000)));
  return next();
};
