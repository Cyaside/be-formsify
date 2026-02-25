import type { Request, Response } from "express";
import {
  createCollaboratorForForm,
  deleteCollaboratorForForm,
  listCollaboratorsForForm,
  updateCollaboratorForForm,
} from "./collaborators.service";
import { respondHttpError } from "../../shared/http/respondHttpError";

const rethrowUnhandled = (res: Response, error: unknown): Response => {
  const handled = respondHttpError(res, error);
  if (handled) return handled;
  throw error;
};

export const listCollaborators = async (req: Request, res: Response) => {
  try {
    const payload = await listCollaboratorsForForm({
      userId: req.user!.id,
      formId: String(req.params.id),
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const createCollaborator = async (req: Request, res: Response) => {
  try {
    const payload = await createCollaboratorForForm({
      userId: req.user!.id,
      formId: String(req.params.id),
      body: req.body as { userId?: string; email?: string; role?: unknown },
    });
    return res.status(201).json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const updateCollaborator = async (req: Request, res: Response) => {
  try {
    const payload = await updateCollaboratorForForm({
      userId: req.user!.id,
      formId: String(req.params.id),
      targetUserId: String(req.params.userId),
      body: req.body as { role?: unknown },
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const deleteCollaborator = async (req: Request, res: Response) => {
  try {
    await deleteCollaboratorForForm({
      userId: req.user!.id,
      formId: String(req.params.id),
      targetUserId: String(req.params.userId),
    });
    return res.status(204).send();
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

