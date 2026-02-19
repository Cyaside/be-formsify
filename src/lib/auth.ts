import bcrypt from "bcrypt";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRES_IN = "7d";

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

export const authRequired = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Invalid Authorization format" });
  }

  try {
    const decoded = jwt.verify(token, requireJwtSecret()) as JwtPayload;
    if (!decoded.sub || typeof decoded.sub !== "string") {
      return res.status(401).json({ message: "Invalid token payload" });
    }
    req.user = { id: decoded.sub, email: String(decoded.email ?? "") };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
