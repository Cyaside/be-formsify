import type { Request, Response } from "express";
import type { Prisma } from "../generated/prisma/client";
import { canEditForm, canReadForm } from "../lib/formAccess";
import prisma from "../lib/prisma";

const DEFAULT_THANK_YOU_TITLE = "Thank you!";
const DEFAULT_THANK_YOU_MESSAGE = "Your response has been recorded.";
const DEFAULT_SECTION_TITLE = "Section 1";
const DEFAULT_QUESTION_TITLE = "Untitled Question";

type BuilderSnapshotSectionInput = {
  id: string;
  title: string;
  description: string | null;
  order?: number;
};

type BuilderSnapshotQuestionInput = {
  id: string;
  sectionId: string;
  title: string;
  description: string | null;
  type: "SHORT_ANSWER" | "MCQ" | "CHECKBOX" | "DROPDOWN";
  required: boolean;
  order?: number;
  options?: string[];
};

type BuilderSnapshotInput = {
  title: string;
  description: string | null;
  thankYouTitle: string;
  thankYouMessage: string;
  isClosed: boolean;
  responseLimit: number | null;
  sections: BuilderSnapshotSectionInput[];
  questions: BuilderSnapshotQuestionInput[];
};

export type BuilderSnapshotResponseData = {
  formId: string;
  version: number;
  snapshot: {
    title: string;
    description: string | null;
    thankYouTitle: string;
    thankYouMessage: string;
    isClosed: boolean;
    responseLimit: number | null;
    sections: Array<{
      id: string;
      title: string;
      description: string | null;
      order: number;
    }>;
    questions: Array<{
      id: string;
      sectionId: string;
      title: string;
      description: string | null;
      type: "SHORT_ANSWER" | "MCQ" | "CHECKBOX" | "DROPDOWN";
      required: boolean;
      order: number;
      options: string[];
    }>;
  };
};

class BuilderSnapshotConflictError extends Error {
  status = 409 as const;
  latestVersion: number;

  constructor(message: string, latestVersion: number) {
    super(message);
    this.name = "BuilderSnapshotConflictError";
    this.latestVersion = latestVersion;
  }
}

type SnapshotClient = typeof prisma | Prisma.TransactionClient;

const requiresOptions = (type: BuilderSnapshotQuestionInput["type"]) =>
  type === "MCQ" || type === "CHECKBOX" || type === "DROPDOWN";

const isTempId = (value: string) => value.startsWith("temp_");

const normalizeSnapshotInput = (
  input: BuilderSnapshotInput,
): BuilderSnapshotInput => {
  const sectionDuplicateCheck = new Set<string>();
  const sortedSections = [...input.sections]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((section, index) => {
      if (sectionDuplicateCheck.has(section.id)) {
        throw new Error(`Duplicate section id: ${section.id}`);
      }
      sectionDuplicateCheck.add(section.id);
      return {
        ...section,
        title: section.title.trim() || `Section ${index + 1}`,
        description: section.description?.trim() || null,
        order: index,
      };
    });

  if (sortedSections.length === 0) {
    throw new Error("Snapshot must contain at least one section");
  }

  const sectionIdSet = new Set(sortedSections.map((section) => section.id));
  const sectionOrderMap = new Map(sortedSections.map((section) => [section.id, section.order]));
  const questionDuplicateCheck = new Set<string>();
  const perSectionOrderCounter = new Map<string, number>();

  const sortedQuestions = [...input.questions]
    .sort((a, b) => {
      const sectionOrderA = sectionOrderMap.get(a.sectionId) ?? 0;
      const sectionOrderB = sectionOrderMap.get(b.sectionId) ?? 0;
      if (sectionOrderA !== sectionOrderB) return sectionOrderA - sectionOrderB;
      return (a.order ?? 0) - (b.order ?? 0);
    })
    .map((question) => {
      if (questionDuplicateCheck.has(question.id)) {
        throw new Error(`Duplicate question id: ${question.id}`);
      }
      questionDuplicateCheck.add(question.id);

      if (!sectionIdSet.has(question.sectionId)) {
        throw new Error(`Question references unknown section: ${question.sectionId}`);
      }

      const nextOrder = perSectionOrderCounter.get(question.sectionId) ?? 0;
      perSectionOrderCounter.set(question.sectionId, nextOrder + 1);

      const normalizedOptions = requiresOptions(question.type)
        ? (question.options ?? [])
            .map((option) => option.trim())
            .filter((option) => option.length > 0)
        : [];

      return {
        ...question,
        title: question.title.trim() || DEFAULT_QUESTION_TITLE,
        description: question.description?.trim() || null,
        order: nextOrder,
        options:
          requiresOptions(question.type) && normalizedOptions.length === 0
            ? ["Option 1"]
            : normalizedOptions,
      };
    });

  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    thankYouTitle: input.thankYouTitle.trim() || DEFAULT_THANK_YOU_TITLE,
    thankYouMessage: input.thankYouMessage.trim() || DEFAULT_THANK_YOU_MESSAGE,
    isClosed: Boolean(input.isClosed),
    responseLimit: input.responseLimit ?? null,
    sections: sortedSections,
    questions: sortedQuestions,
  };
};

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
        type: question.type as BuilderSnapshotQuestionInput["type"],
        required: question.required,
        order: question.order,
        options: question.options.map((option) => option.label),
      })),
    },
  };
};

const sendSnapshotConflict = async (
  res: Response,
  formId: string,
  message: string,
  latestVersion?: number,
) => {
  const latest = await loadBuilderSnapshot(prisma, formId);
  return res.status(409).json({
    message,
    latestVersion: latest?.version ?? latestVersion ?? null,
    snapshot: latest?.snapshot ?? null,
  });
};

export const getBuilderSnapshot = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const access = await canReadForm(req.user!.id, formId);
  if (!access.ok) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  const data = await loadBuilderSnapshot(prisma, formId);
  if (!data) {
    return res.status(404).json({ message: "Form not found" });
  }

  return res.json({ data });
};

export const updateBuilderSnapshot = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const access = await canEditForm(req.user!.id, formId);
  if (!access.ok) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  let normalizedSnapshot: BuilderSnapshotInput;
  try {
    normalizedSnapshot = normalizeSnapshotInput(req.body.snapshot as BuilderSnapshotInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid snapshot payload";
    return res.status(400).json({ message });
  }

  if (!normalizedSnapshot.title) {
    return res.status(400).json({ message: "Title is required" });
  }

  const baseVersion = Number(req.body.baseVersion);
  if (!Number.isInteger(baseVersion) || baseVersion < 0) {
    return res.status(400).json({ message: "Invalid baseVersion" });
  }

  try {
    const data = await prisma.$transaction(async (tx) => {
      const form = await tx.form.findUnique({
        where: { id: formId },
        select: { id: true, version: true },
      });
      if (!form) {
        throw new Error("FORM_NOT_FOUND");
      }

      if (form.version !== baseVersion) {
        throw new BuilderSnapshotConflictError("Builder snapshot version conflict", form.version);
      }

      const responseCount = await tx.response.count({ where: { formId } });
      if (responseCount > 0) {
        throw new BuilderSnapshotConflictError(
          "Builder snapshot updates are locked once the form has responses",
          form.version,
        );
      }

      const [existingSections, existingQuestions] = await Promise.all([
        tx.section.findMany({
          where: { formId },
          select: { id: true },
        }),
        tx.question.findMany({
          where: { formId },
          select: { id: true },
        }),
      ]);

      const existingSectionIdSet = new Set(existingSections.map((item) => item.id));
      const existingQuestionIdSet = new Set(existingQuestions.map((item) => item.id));

      await tx.question.deleteMany({ where: { formId } });
      await tx.section.deleteMany({ where: { formId } });

      const sectionIdMap = new Map<string, string>();
      const usedPersistedSectionIds = new Set<string>();

      for (const section of normalizedSnapshot.sections) {
        const preserveId =
          existingSectionIdSet.has(section.id) &&
          !isTempId(section.id) &&
          !usedPersistedSectionIds.has(section.id);

        const created = await tx.section.create({
          data: {
            ...(preserveId ? { id: section.id } : {}),
            formId,
            title: section.title || DEFAULT_SECTION_TITLE,
            description: section.description,
            order: section.order ?? 0,
          },
          select: { id: true },
        });

        if (preserveId) {
          usedPersistedSectionIds.add(section.id);
        }
        sectionIdMap.set(section.id, created.id);
      }

      const usedPersistedQuestionIds = new Set<string>();

      for (const question of normalizedSnapshot.questions) {
        const resolvedSectionId = sectionIdMap.get(question.sectionId);
        if (!resolvedSectionId) {
          throw new Error(`Question references unresolved section: ${question.sectionId}`);
        }

        const preserveId =
          existingQuestionIdSet.has(question.id) &&
          !isTempId(question.id) &&
          !usedPersistedQuestionIds.has(question.id);

        await tx.question.create({
          data: {
            ...(preserveId ? { id: question.id } : {}),
            formId,
            sectionId: resolvedSectionId,
            title: question.title || DEFAULT_QUESTION_TITLE,
            description: question.description,
            type: question.type,
            required: question.required,
            order: question.order ?? 0,
            options: requiresOptions(question.type)
              ? {
                  create: (question.options ?? []).map((label, index) => ({
                    label,
                    order: index,
                  })),
                }
              : undefined,
          },
        });

        if (preserveId) {
          usedPersistedQuestionIds.add(question.id);
        }
      }

      await tx.form.update({
        where: { id: formId },
        data: {
          title: normalizedSnapshot.title,
          description: normalizedSnapshot.description,
          thankYouTitle: normalizedSnapshot.thankYouTitle,
          thankYouMessage: normalizedSnapshot.thankYouMessage,
          isClosed: normalizedSnapshot.isClosed,
          responseLimit: normalizedSnapshot.responseLimit,
          version: { increment: 1 },
        },
      });

      const latest = await loadBuilderSnapshot(tx, formId);
      if (!latest) {
        throw new Error("FORM_NOT_FOUND");
      }
      return latest;
    });

    return res.json({ data });
  } catch (error) {
    if (error instanceof BuilderSnapshotConflictError) {
      return sendSnapshotConflict(res, formId, error.message, error.latestVersion);
    }
    if (error instanceof Error && error.message === "FORM_NOT_FOUND") {
      return res.status(404).json({ message: "Form not found" });
    }
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to update builder snapshot" });
  }
};
