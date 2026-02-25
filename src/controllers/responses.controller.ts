import type { Request, Response } from "express";
import {
  deleteResponseForOwner,
  getFormSummaryForOwner,
  getResponseDetailForOwner,
  listResponsesForOwner,
} from "../modules/responses/responses.service";
import { respondHttpError } from "../shared/http/respondHttpError";

const rethrowUnhandled = (res: Response, error: unknown): Response => {
  const handled = respondHttpError(res, error);
  if (handled) return handled;
  throw error;
};

export const listResponses = async (req: Request, res: Response) => {
  try {
    const formId = String(req.params.id);
    const userId = String(req.user!.id);
    const payload = await listResponsesForOwner({
      formId,
      userId,
      query: { page: req.query.page, limit: req.query.limit },
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const getResponseDetail = async (req: Request, res: Response) => {
  try {
    const formId = String(req.params.id);
    const responseId = String(req.params.responseId);
    const userId = String(req.user!.id);
    const payload = await getResponseDetailForOwner({ formId, responseId, userId });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const getSummary = async (req: Request, res: Response) => {
  try {
    const formId = String(req.params.id);
    const userId = String(req.user!.id);
    const payload = await getFormSummaryForOwner({ formId, userId });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const deleteResponse = async (req: Request, res: Response) => {
  try {
    const formId = String(req.params.id);
    const responseId = String(req.params.responseId);
    const userId = String(req.user!.id);
    await deleteResponseForOwner({ formId, responseId, userId });
    return res.status(204).send();
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};
