import type { Request, Response } from "express";
import {
  createSectionForForm,
  deleteSectionByIdForUser,
  listSectionsForForm,
  updateSectionByIdForUser,
} from "./sections.service";
import { respondHttpError } from "../../shared/http/respondHttpError";

const rethrowUnhandled = (res: Response, error: unknown): Response => {
  const handled = respondHttpError(res, error);
  if (handled) return handled;
  throw error;
};

export const listSections = async (req: Request, res: Response) => {
  try {
    const payload = await listSectionsForForm({
      formId: String(req.params.id),
      userId: req.user?.id ?? null,
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const createSection = async (req: Request, res: Response) => {
  try {
    const payload = await createSectionForForm({
      formId: String(req.params.id),
      userId: req.user!.id,
      body: req.body,
    });
    return res.status(201).json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const updateSection = async (req: Request, res: Response) => {
  try {
    const payload = await updateSectionByIdForUser({
      sectionId: String(req.params.id),
      userId: req.user!.id,
      body: req.body,
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const deleteSection = async (req: Request, res: Response) => {
  try {
    await deleteSectionByIdForUser({
      sectionId: String(req.params.id),
      userId: req.user!.id,
    });
    return res.status(204).send();
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

