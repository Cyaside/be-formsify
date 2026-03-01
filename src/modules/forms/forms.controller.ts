import type { Request, Response } from "express";
import {
  createFormForUser,
  deleteFormForUser,
  getBuilderBootstrapForUser,
  getFormForUser,
  listCollaboratorFormsForUser,
  listPublicForms as listPublicFormsService,
  listOwnedFormsForUser,
  updateFormForUser,
} from "./forms.service";
import { respondHttpError } from "../../shared/http/respondHttpError";

const rethrowUnhandled = (res: Response, error: unknown): Response => {
  const handled = respondHttpError(res, error);
  if (handled) return handled;
  throw error;
};

export const listForms = async (req: Request, res: Response) => {
  try {
    const payload = await listOwnedFormsForUser({
      userId: req.user!.id,
      query: {
        search: req.query.search,
        status: req.query.status,
        sort: req.query.sort,
      },
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const listCollaboratorForms = async (req: Request, res: Response) => {
  try {
    const payload = await listCollaboratorFormsForUser({
      userId: req.user!.id,
      query: {
        search: req.query.search,
        status: req.query.status,
        sort: req.query.sort,
      },
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const listPublicForms = async (req: Request, res: Response) => {
  const payload = await listPublicFormsService({
    page: req.query.page,
    limit: req.query.limit,
  });
  return res.json(payload);
};

export const getForm = async (req: Request, res: Response) => {
  try {
    const payload = await getFormForUser({
      formId: String(req.params.id),
      userId: req.user?.id ?? null,
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const getBuilderBootstrap = async (req: Request, res: Response) => {
  try {
    const payload = await getBuilderBootstrapForUser({
      formId: String(req.params.id),
      userId: req.user!.id,
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const createForm = async (req: Request, res: Response) => {
  try {
    const payload = await createFormForUser({
      userId: req.user!.id,
      body: req.body,
    });
    return res.status(201).json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const updateForm = async (req: Request, res: Response) => {
  try {
    const payload = await updateFormForUser({
      formId: String(req.params.id),
      userId: req.user!.id,
      body: req.body,
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const deleteForm = async (req: Request, res: Response) => {
  try {
    await deleteFormForUser({
      formId: String(req.params.id),
      userId: req.user!.id,
    });
    return res.status(204).send();
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

