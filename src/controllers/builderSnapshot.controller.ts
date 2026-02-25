import type { Request, Response } from "express";
import {
  BuilderHttpError,
  getBuilderSnapshotForUser,
  loadBuilderSnapshot,
  updateBuilderSnapshotForUser,
} from "../modules/builder/builder.service";

export type { BuilderSnapshotResponseData } from "../modules/builder/builder.types";
export { loadBuilderSnapshot };

const handleBuilderHttpError = (res: Response, error: unknown) => {
  if (error instanceof BuilderHttpError) {
    return res.status(error.status).json(error.payload);
  }
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
