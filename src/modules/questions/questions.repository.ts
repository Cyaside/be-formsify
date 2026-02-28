import prisma from "../../shared/db/prisma";

export const questionsRepository = {
  findFirstSectionByForm: (formId: string) =>
    prisma.section.findFirst({
      where: { formId },
      orderBy: { order: "asc" },
    }),

  createDefaultSection: (formId: string) =>
    prisma.section.create({
      data: {
        formId,
        title: "Section 1",
        order: 0,
      },
    }),

  findSectionRef: (sectionId: string) =>
    prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, formId: true },
    }),

  countAnswersByQuestion: (questionId: string) =>
    prisma.answer.count({
      where: { questionId },
    }),

  listQuestionsByForm: (formId: string) =>
    prisma.question.findMany({
      where: { formId },
      orderBy: [{ section: { order: "asc" } }, { order: "asc" }],
      include: { options: { orderBy: { order: "asc" } } },
    }),

  countQuestionsBySection: (sectionId: string) => prisma.question.count({ where: { sectionId } }),

  createQuestion: (params: {
    formId: string;
    sectionId: string;
    title: string;
    description: string | null;
    type: "SHORT_ANSWER" | "MCQ" | "CHECKBOX" | "DROPDOWN";
    required: boolean;
    order: number;
    options?: string[] | null;
  }) =>
    prisma.question.create({
      data: {
        formId: params.formId,
        sectionId: params.sectionId,
        title: params.title,
        description: params.description,
        type: params.type,
        required: params.required,
        order: params.order,
        options: params.options
          ? {
              create: params.options.map((label, index) => ({
                label,
                order: index,
              })),
            }
          : undefined,
      },
      include: { options: { orderBy: { order: "asc" } } },
    }),

  findQuestionRef: (questionId: string) =>
    prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true, formId: true, type: true, sectionId: true },
    }),

  deleteQuestion: (questionId: string) => prisma.question.delete({ where: { id: questionId } }),
};

export { prisma as questionsPrisma };

