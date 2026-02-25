import type { Prisma } from "../../generated/prisma/client";
import prisma from "../../lib/prisma";
import type { BuilderSnapshotResponseData, BuilderSnapshotQuestionType } from "./builder.types";

export type SnapshotClient = typeof prisma | Prisma.TransactionClient;

export const loadBuilderSnapshot = async (
  client: SnapshotClient,
  formId: string,
): Promise<BuilderSnapshotResponseData | null> => {
  const [form, sections, questions] = await Promise.all([
    client.form.findUnique({
      where: { id: formId },
      select: {
        id: true,
        title: true,
        description: true,
        thankYouTitle: true,
        thankYouMessage: true,
        isClosed: true,
        responseLimit: true,
        version: true,
      },
    }),
    client.section.findMany({
      where: { formId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        order: true,
      },
    }),
    client.question.findMany({
      where: { formId },
      orderBy: [{ section: { order: "asc" } }, { order: "asc" }],
      include: {
        options: {
          orderBy: { order: "asc" },
          select: { label: true },
        },
      },
    }),
  ]);

  if (!form) return null;

  return {
    formId: form.id,
    version: form.version,
    snapshot: {
      title: form.title,
      description: form.description,
      thankYouTitle: form.thankYouTitle,
      thankYouMessage: form.thankYouMessage,
      isClosed: form.isClosed,
      responseLimit: form.responseLimit,
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        order: section.order,
      })),
      questions: questions.map((question) => ({
        id: question.id,
        sectionId: question.sectionId,
        title: question.title,
        description: question.description,
        type: question.type as BuilderSnapshotQuestionType,
        required: question.required,
        order: question.order,
        options: question.options.map((option) => option.label),
      })),
    },
  };
};
