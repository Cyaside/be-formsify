import type { Request, Response } from "express";
import { clearAuthCookie, setAuthCookie } from "../../shared/auth/cookies";
import {
  getMe,
  loginWithEmailPassword,
  loginWithGoogle,
  registerWithEmailPassword,
} from "./auth.service";
import { respondHttpError } from "../../shared/http/respondHttpError";

const rethrowUnhandled = (res: Response, error: unknown): Response => {
  const handled = respondHttpError(res, error);
  if (handled) return handled;
  throw error;
};

export const register = async (req: Request, res: Response) => {
  try {
    const payload = await registerWithEmailPassword({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
    });
    setAuthCookie(res, payload.token);
    return res.status(201).json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const payload = await loginWithEmailPassword({
      email: req.body.email,
      password: req.body.password,
    });
    setAuthCookie(res, payload.token);
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const googleAuth = async (req: Request, res: Response) => {
  try {
    const payload = await loginWithGoogle({
      idToken: req.body.idToken,
      code: req.body.code,
    });
    setAuthCookie(res, payload.token);
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const me = async (req: Request, res: Response) => {
  try {
    const payload = await getMe(req.user!.id);
    setAuthCookie(res, payload.token);
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const logout = async (_req: Request, res: Response) => {
  clearAuthCookie(res);
  return res.status(204).send();
};


