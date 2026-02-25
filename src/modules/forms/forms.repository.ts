import type { Prisma } from "../../generated/prisma/client";
import prisma from "../../shared/db/prisma";

export const formsRepository = {
  listForms: (params: {
    where: Prisma.FormWhereInput;
    orderBy: Prisma.FormOrderByWithRelationInput;
  }) =>
    prisma.form.findMany({
      where: params.where,
      orderBy: params.orderBy,
      include: {
        owner: { select: { id: true, email: true, name: true } },
      },
    }),

  countPublicForms: () => prisma.form.count({ where: { isPublished: true } }),

  listPublicForms: (params: { skip: number; take: number }) =>
    prisma.form.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: "desc" },
      skip: params.skip,
      take: params.take,
      include: {
        owner: { select: { id: true, email: true, name: true } },
      },
    }),

  findFormDetailWithOwnerAndCount: (formId: string) =>
    prisma.form.findUnique({
      where: { id: formId },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { responses: true } },
      },
    }),

  findFormRef: (formId: string) => prisma.form.findUnique({ where: { id: formId } }),

  countResponsesByForm: (formId: string) => prisma.response.count({ where: { formId } }),

  countQuestionsByForm: (formId: string) => prisma.question.count({ where: { formId } }),

  updateForm: (formId: string, data: Prisma.FormUpdateInput) =>
    prisma.form.update({
      where: { id: formId },
      data,
      include: { owner: { select: { id: true, email: true, name: true } } },
    }),

  deleteForm: (formId: string) => prisma.form.delete({ where: { id: formId } }),
};

export { prisma as formsPrisma };

