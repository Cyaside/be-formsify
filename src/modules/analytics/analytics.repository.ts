import { Prisma } from "../../generated/prisma/client";
import prisma from "../../shared/db/prisma";

export const analyticsRepository = {
  countFormsByOwner: (userId: string) => prisma.form.count({ where: { ownerId: userId } }),
  countResponsesByOwner: (userId: string) =>
    prisma.response.count({ where: { form: { ownerId: userId } } }),
  queryResponseTrend: (
    userId: string,
    from: Date,
    endExclusive: Date,
    bucket: "day" | "week" | "month",
  ) =>
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
};

