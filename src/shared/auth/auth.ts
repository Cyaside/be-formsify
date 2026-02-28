import bcrypt from "bcrypt";
import jwt, { type JwtPayload } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRES_IN = "7d";

export const AUTH_COOKIE_NAME = "formsify_token";
export const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const requireJwtSecret = () => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }
  return JWT_SECRET;
};

export const hashPassword = async (password: string) => {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (password: string, hash: string) =>
  bcrypt.compare(password, hash);

export const signToken = (payload: { id: string; email: string }) =>
  jwt.sign({ sub: payload.id, email: payload.email }, requireJwtSecret(), {
    expiresIn: TOKEN_EXPIRES_IN,
  });

export const verifyToken = (token: string) =>
  jwt.verify(token, requireJwtSecret()) as JwtPayload;

export const getTokenFromAuthHeader = (header?: string | null) => {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
};
