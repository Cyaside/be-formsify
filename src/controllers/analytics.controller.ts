import type { Request, Response } from "express";
import { Prisma } from "../generated/prisma/client";
import prisma from "../lib/prisma";

const DEFAULT_RANGE_DAYS = 30;

const parseDateOnly = (value: string | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getRange = (req: Request) => {
  const fromParam = parseDateOnly(typeof req.query.from === "string" ? req.query.from : "");
  const toParam = parseDateOnly(typeof req.query.to === "string" ? req.query.to : "");
  const today = startOfDay(new Date());
  const from = fromParam ?? addDays(today, -(DEFAULT_RANGE_DAYS - 1));
  const to = toParam ?? today;
  const fromDate = startOfDay(from);
  const toDate = startOfDay(to);
  const endExclusive = addDays(toDate, 1);
  return { from: fromDate, to: toDate, endExclusive };
};

const getBucket = (req: Request) => {
  const bucket =
    typeof req.query.bucket === "string" ? req.query.bucket.trim().toLowerCase() : "day";
  if (bucket === "week" || bucket === "month") return bucket;
  return "day";
};

export const getGlobalAnalytics = async (req: Request, res: Response) => {
  const userId = String(req.user!.id);
  const { from, to, endExclusive } = getRange(req);
  const bucket = getBucket(req);

  const [totalForms, totalResponses, trend] = await Promise.all([
    prisma.form.count({ where: { ownerId: userId } }),
    prisma.response.count({ where: { form: { ownerId: userId } } }),
    prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>(
      Prisma.sql`
        SELECT date_trunc(${bucket}, r."createdAt") AS bucket,
               COUNT(*)::bigint AS count
        FROM "Response" r
        JOIN "Form" f ON f.id = r."formId"
        WHERE f."ownerId" = ${userId}
          AND r."createdAt" >= ${from}
          AND r."createdAt" < ${endExclusive}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ),
  ]);

  return res.json({
    data: {
      totals: {
        forms: totalForms,
        responses: totalResponses,
      },
      responseTrend: trend.map((item) => ({
        date: item.bucket.toISOString(),
        count: Number(item.count),
      })),
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
        bucket,
      },
    },
  });
};
