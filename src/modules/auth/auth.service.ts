import { OAuth2Client } from "google-auth-library";
import { hashPassword, signToken, verifyPassword } from "../../shared/auth/auth";
import { httpError, HttpServiceError } from "../../shared/errors/httpError";
import { authRepository } from "./auth.repository";

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

export const registerWithEmailPassword = async ({
  name: rawName,
  email: rawEmail,
  password: rawPassword,
}: {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}) => {
  const name = String(rawName ?? "").trim();
  const email = String(rawEmail ?? "").trim().toLowerCase();
  const password = String(rawPassword ?? "");

  if (!name || !email || !password) {
    throw httpError(400, "Name, email, and password are required");
  }
  if (password.length < 6) {
    throw httpError(400, "Password must be at least 6 characters");
  }

  const existing = await authRepository.findUserByEmail(email);
  if (existing) {
    throw httpError(409, "Email is already registered");
  }
  const existingName = await authRepository.findUserByName(name);
  if (existingName) {
    throw httpError(409, "Name is already taken");
  }

  const passwordHash = await hashPassword(password);
  const user = await authRepository.createLocalUser({
    name,
    email,
    passwordHash,
  });

  const token = signToken({ id: user.id, email: user.email });
  return { token, user };
};

export const loginWithEmailPassword = async ({
  email: rawEmail,
  password: rawPassword,
}: {
  email?: unknown;
  password?: unknown;
}) => {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  const password = String(rawPassword ?? "");

  if (!email || !password) {
    throw httpError(400, "Email and password are required");
  }

  const user = await authRepository.findUserByEmail(email);
  if (!user || !user.passwordHash) {
    throw httpError(401, "Invalid credentials");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw httpError(401, "Invalid credentials");
  }

  const token = signToken({ id: user.id, email: user.email });
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
    },
  };
};

export const loginWithGoogle = async ({
  idToken: rawIdToken,
  code: rawCode,
}: {
  idToken?: unknown;
  code?: unknown;
}) => {
  if (!googleClient || !googleClientId) {
    throw httpError(500, "Google OAuth is not configured");
  }

  let idToken = String(rawIdToken ?? "").trim();
  let accessToken = "";
  const code = String(rawCode ?? "");
  if (!idToken && !code) {
    throw httpError(400, "idToken or code is required");
  }

  try {
    if (!idToken && code) {
      if (!googleClientSecret || !googleRedirectUri) {
        throw httpError(500, "Google OAuth code exchange is not configured");
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
      throw httpError(401, "Invalid Google token");
    }
    if (identity.email_verified === false) {
      throw httpError(401, "Google email is not verified");
    }

    const email = identity.email.toLowerCase();
    const googleId = identity.sub;
    const name = identity.name ?? null;

    let user = await authRepository.findUserByGoogleId(googleId);
    if (!user) {
      const existingByEmail = await authRepository.findUserByEmail(email);
      if (existingByEmail) {
        user = await authRepository.updateUserGoogleLink({ id: existingByEmail.id, googleId });
      } else {
        if (name) {
          const existingByName = await authRepository.findUserByName(name);
          if (existingByName) {
            throw httpError(409, "Name is already taken");
          }
        }
        user = await authRepository.createGoogleUser({ email, name, googleId });
      }
    }

    const token = signToken({ id: user.id, email: user.email });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
      },
    };
  } catch (error) {
    if (error instanceof HttpServiceError) {
      throw error;
    }

    const reason = getErrorMessage(error);
    console.error("[auth/google] Google OAuth failed:", reason);

    const isDev = process.env.NODE_ENV !== "production";
    throw new HttpServiceError(401, {
      message: isDev ? `Invalid Google token (${reason})` : "Invalid Google token",
    });
  }
};

export const getMe = async (userId: string) => {
  const user = await authRepository.findMeById(userId);
  if (!user) {
    throw httpError(401, "Invalid or expired token");
  }
  const token = signToken({ id: user.id, email: user.email });
  return { token, user };
};

