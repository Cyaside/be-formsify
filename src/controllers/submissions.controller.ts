import type { Request, Response } from "express";
import {
  SubmissionHttpError,
  submitFormResponse,
} from "../modules/submissions/submissions.service";

export const submitForm = async (req: Request, res: Response) => {
  try {
    const formId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await submitFormResponse({
      formId,
      rawAnswers: req.body.answers,
    });

    return res.status(201).json({ data });
  } catch (error) {
    if (error instanceof SubmissionHttpError) {
      return res.status(error.status).json(error.payload);
    }
    throw error;
  }
};
