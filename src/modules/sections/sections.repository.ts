import prisma from "../../shared/db/prisma";

export const sectionsRepository = {
  countAnswersBySection: (sectionId: string) =>
    prisma.answer.count({
      where: {
        question: {
          sectionId,
        },
      },
    }),

  listByForm: (formId: string) =>
    prisma.section.findMany({
      where: { formId },
      orderBy: { order: "asc" },
    }),

  countByForm: (formId: string) => prisma.section.count({ where: { formId } }),

  create: (params: {
    formId: string;
    title: string;
    description: string | null;
    order: number;
  }) =>
    prisma.section.create({
      data: {
        formId: params.formId,
        title: params.title,
        description: params.description,
        order: params.order,
      },
    }),

  findRef: (sectionId: string) =>
    prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, formId: true },
    }),

  update: (sectionId: string, data: { title?: string; description?: string | null; order?: number }) =>
    prisma.section.update({
      where: { id: sectionId },
      data,
    }),

  countQuestionsBySection: (sectionId: string) => prisma.question.count({ where: { sectionId } }),

  delete: (sectionId: string) => prisma.section.delete({ where: { id: sectionId } }),
};

