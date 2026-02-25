import type { Request, Response } from "express";
import {
  createQuestionForForm,
  deleteQuestionByIdForUser,
  listQuestionsForForm,
  updateQuestionByIdForUser,
} from "./questions.service";
import { respondHttpError } from "../../shared/http/respondHttpError";

const rethrowUnhandled = (res: Response, error: unknown): Response => {
  const handled = respondHttpError(res, error);
  if (handled) return handled;
  throw error;
};

export const listQuestions = async (req: Request, res: Response) => {
  try {
    const payload = await listQuestionsForForm({
      formId: String(req.params.id),
      userId: req.user?.id ?? null,
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const createQuestion = async (req: Request, res: Response) => {
  try {
    const payload = await createQuestionForForm({
      formId: String(req.params.id),
      userId: req.user!.id,
      body: req.body,
    });
    return res.status(201).json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const updateQuestion = async (req: Request, res: Response) => {
  try {
    const payload = await updateQuestionByIdForUser({
      questionId: String(req.params.id),
      userId: req.user!.id,
      body: req.body,
    });
    return res.json(payload);
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

export const deleteQuestion = async (req: Request, res: Response) => {
  try {
    await deleteQuestionByIdForUser({
      questionId: String(req.params.id),
      userId: req.user!.id,
    });
    return res.status(204).send();
  } catch (error) {
    return rethrowUnhandled(res, error);
  }
};

