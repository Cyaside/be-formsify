import prisma from "../../lib/prisma";

export const responsesRepository = {
  findFormOwnerBrief: (formId: string) =>
    prisma.form.findUnique({
      where: { id: formId },
      select: { id: true, ownerId: true, title: true, description: true },
    }),

  countResponses: (formId: string) => prisma.response.count({ where: { formId } }),

  findResponsesWithAnswers: (params: {
    formId: string;
    skip?: number;
    take?: number;
  }) =>
    prisma.response.findMany({
      where: { formId: params.formId },
      orderBy: { createdAt: "desc" },
      ...(typeof params.skip === "number" ? { skip: params.skip } : {}),
      ...(typeof params.take === "number" ? { take: params.take } : {}),
      include: {
        answers: {
          include: { question: { include: { options: true } } },
        },
      },
    }),

  findResponseDetailById: (responseId: string) =>
    prisma.response.findUnique({
      where: { id: responseId },
      include: {
        answers: {
          include: {
            question: {
              include: { options: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    }),

  findQuestionsForSummary: (formId: string) =>
    prisma.question.findMany({
      where: { formId },
      include: { options: true },
      orderBy: { order: "asc" },
    }),

  findAnswersForSummary: (formId: string) =>
    prisma.answer.findMany({
      where: { response: { is: { formId } } },
      select: { questionId: true, optionId: true, text: true },
    }),

  findResponseRef: (responseId: string) =>
    prisma.response.findUnique({
      where: { id: responseId },
      select: { id: true, formId: true },
    }),

  deleteResponse: (responseId: string) => prisma.response.delete({ where: { id: responseId } }),
};
