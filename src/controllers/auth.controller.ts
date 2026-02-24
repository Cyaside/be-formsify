import { OAuth2Client } from "google-auth-library";
import type { Request, Response } from "express";
import prisma from "../lib/prisma";
import { hashPassword, signToken, verifyPassword } from "../lib/auth";
import { setAuthCookie, clearAuthCookie } from "../lib/cookies";

const unwrapEnvString = (value?: string) => {
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

const googleClientId = unwrapEnvString(process.env.GOOGLE_CLIENT_ID);
const googleClientSecret = unwrapEnvString(process.env.GOOGLE_CLIENT_SECRET);
const googleRedirectUri = unwrapEnvString(process.env.GOOGLE_REDIRECT_URI);
const googleClient = googleClientId
  ? new OAuth2Client(googleClientId, googleClientSecret, googleRedirectUri)
  : null;

type GoogleUserIdentity = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string | null;
};

const getGoogleUserInfoFromAccessToken = async (accessToken: string): Promise<GoogleUserIdentity> => {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as Partial<GoogleUserIdentity>;
  if (!payload.email || !payload.sub) {
    throw new Error("Google userinfo response is missing email/sub");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified,
    name: payload.name ?? null,
  };
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

export const register = async (req: Request, res: Response) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const name = String(req.body.name ?? "").trim();

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: "Email is already registered" });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name || null,
      provider: "LOCAL",
    },
    select: {
      id: true,
      email: true,
      name: true,
      provider: true,
      createdAt: true,
    },
  });

  const token = signToken({ id: user.id, email: user.email });
  setAuthCookie(res, token);
  return res.status(201).json({ token, user });
};

export const login = async (req: Request, res: Response) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signToken({ id: user.id, email: user.email });
  setAuthCookie(res, token);
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
    },
  });
};

export const googleAuth = async (req: Request, res: Response) => {
  if (!googleClient || !googleClientId) {
    return res.status(500).json({ message: "Google OAuth is not configured" });
  }

  let idToken = String(req.body.idToken ?? "").trim();
  let accessToken = "";
  const code = String(req.body.code ?? "");
  if (!idToken && !code) {
    return res.status(400).json({ message: "idToken or code is required" });
  }

  try {
    if (!idToken && code) {
      if (!googleClientSecret || !googleRedirectUri) {
        return res.status(500).json({
          message: "Google OAuth code exchange is not configured",
        });
      }
      const { tokens } = await googleClient.getToken({
        code,
        redirect_uri: googleRedirectUri,
      });
      idToken = String(tokens.id_token ?? "").trim();
      accessToken = String(tokens.access_token ?? "").trim();
    }

    let identity: GoogleUserIdentity | null = null;
    if (idToken) {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();
      if (payload?.email && payload.sub) {
        identity = {
          sub: payload.sub,
          email: payload.email,
          email_verified: payload.email_verified,
          name: payload.name ?? null,
        };
      }
    }

    if (!identity && accessToken) {
      identity = await getGoogleUserInfoFromAccessToken(accessToken);
    }

    if (!identity?.email || !identity.sub) {
      return res.status(401).json({ message: "Invalid Google token" });
    }
    if (identity.email_verified === false) {
      return res.status(401).json({ message: "Google email is not verified" });
    }

    const email = identity.email.toLowerCase();
    const googleId = identity.sub;
    const name = identity.name ?? null;

    let user = await prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      const existingByEmail = await prisma.user.findUnique({ where: { email } });
      if (existingByEmail) {
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId, provider: "GOOGLE" },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email,
            name,
            provider: "GOOGLE",
            googleId,
          },
        });
      }
    }

    const token = signToken({ id: user.id, email: user.email });
    setAuthCookie(res, token);
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
      },
    });
  } catch (error) {
    const reason = getErrorMessage(error);
    console.error("[auth/google] Google OAuth failed:", reason);

    const isDev = process.env.NODE_ENV !== "production";
    return res.status(401).json({
      message: isDev ? `Invalid Google token (${reason})` : "Invalid Google token",
    });
  }
};

export const me = async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, provider: true, createdAt: true },
  });
  return res.json({ user });
};

export const logout = async (_req: Request, res: Response) => {
  clearAuthCookie(res);
  return res.status(204).send();
};
