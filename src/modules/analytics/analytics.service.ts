import { analyticsRepository } from "./analytics.repository";

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

export const getAnalyticsRange = (params: { from?: string; to?: string }) => {
  const fromParam = parseDateOnly(params.from);
  const toParam = parseDateOnly(params.to);
  const today = startOfDay(new Date());
  const from = fromParam ?? addDays(today, -(DEFAULT_RANGE_DAYS - 1));
  const to = toParam ?? today;
  const fromDate = startOfDay(from);
  const toDate = startOfDay(to);
  const endExclusive = addDays(toDate, 1);
  return { from: fromDate, to: toDate, endExclusive };
};

export const getAnalyticsBucket = (bucket?: string) => {
  const normalized = typeof bucket === "string" ? bucket.trim().toLowerCase() : "day";
  if (normalized === "week" || normalized === "month") return normalized;
  return "day";
};

export const getGlobalAnalyticsForUser = async ({
  userId,
  from,
  to,
  bucket,
}: {
  userId: string;
  from?: string;
  to?: string;
  bucket?: string;
}) => {
  const range = getAnalyticsRange({ from, to });
  const normalizedBucket = getAnalyticsBucket(bucket);

  const [totalForms, totalResponses, trend, latestResponse] = await Promise.all([
    analyticsRepository.countFormsByOwner(userId),
    analyticsRepository.countResponsesByOwner(userId),
    analyticsRepository.queryResponseTrend(
      userId,
      range.from,
      range.endExclusive,
      normalizedBucket,
    ),
    analyticsRepository.findLatestResponseByOwner(userId),
  ]);

  return {
    totals: {
      forms: totalForms,
      responses: totalResponses,
    },
    responseTrend: trend.map((item) => ({
      date: item.bucket.toISOString(),
      count: Number(item.count),
    })),
    latestResponseAt: latestResponse?.createdAt.toISOString() ?? null,
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      bucket: normalizedBucket,
    },
  };
};
