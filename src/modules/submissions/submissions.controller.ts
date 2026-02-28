import type { Request, Response } from "express";
import { submitFormResponse } from "./submissions.service";
import { respondHttpError } from "../../shared/http/respondHttpError";

export const submitForm = async (req: Request, res: Response) => {
  try {
    const formId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await submitFormResponse({
      formId,
      rawAnswers: req.body.answers,
    });

    return res.status(201).json({ data });
  } catch (error) {
    const handled = respondHttpError(res, error);
    if (handled) return handled;
    throw error;
  }
};

