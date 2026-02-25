import type { Request, Response } from "express";
import {
  getBuilderSnapshotForUser,
  loadBuilderSnapshot,
  updateBuilderSnapshotForUser,
} from "../modules/builder/builder.service";
import { respondHttpError } from "../shared/http/respondHttpError";

export type { BuilderSnapshotResponseData } from "../modules/builder/builder.types";
export { loadBuilderSnapshot };

const handleBuilderHttpError = (res: Response, error: unknown) => {
  const handled = respondHttpError(res, error);
  if (handled) return handled;
  throw error;
};

export const getBuilderSnapshot = async (req: Request, res: Response) => {
  try {
    const formId = String(req.params.id);
    const data = await getBuilderSnapshotForUser(req.user!.id, formId);
    return res.json({ data });
  } catch (error) {
    return handleBuilderHttpError(res, error);
  }
};

export const updateBuilderSnapshot = async (req: Request, res: Response) => {
  try {
    const formId = String(req.params.id);
    const data = await updateBuilderSnapshotForUser({
      userId: req.user!.id,
      formId,
      rawBaseVersion: req.body.baseVersion,
      rawSnapshot: req.body.snapshot,
    });
    return res.json({ data });
  } catch (error) {
    return handleBuilderHttpError(res, error);
  }
};
