import type { Request, Response } from "express";
import { getGlobalAnalyticsForUser } from "../modules/analytics/analytics.service";

export const getGlobalAnalytics = async (req: Request, res: Response) => {
  const userId = String(req.user!.id);
  const data = await getGlobalAnalyticsForUser({
    userId,
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    bucket: typeof req.query.bucket === "string" ? req.query.bucket : undefined,
  });

  return res.json({ data });
};
