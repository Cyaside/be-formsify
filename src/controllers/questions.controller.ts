import type { Request, Response } from "express";
import { canEditForm, canReadForm } from "../lib/formAccess";
import prisma from "../lib/prisma";

const QUESTION_TYPES = ["SHORT_ANSWER", "MCQ", "CHECKBOX", "DROPDOWN"] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

const requiresOptions = (type: QuestionType) =>
  type === "MCQ" || type === "CHECKBOX" || type === "DROPDOWN";

const parseOptions = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  const labels = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((label) => label.length > 0);
  return labels;
};

type QuestionUpdateData = {
  title?: string;
  description?: string | null;
  type?: QuestionType;
  required?: boolean;
  order?: number;
  sectionId?: string;
};

type ParsedQuestionUpdatePayload =
  | { error: string }
  | { data: QuestionUpdateData; nextType: QuestionType; options: string[] | null };

const applyTitleUpdate = (data: QuestionUpdateData, body: Request["body"]) => {
  if (body.title === undefined) return null;
  const title = String(body.title ?? "").trim();
  if (!title) return "Title cannot be empty";
  data.title = title;
  return null;
};

const applyDescriptionUpdate = (data: QuestionUpdateData, body: Request["body"]) => {
  if (body.description === undefined) return;
  data.description = body.description === null ? null : String(body.description).trim();
};

const applyTypeUpdate = (data: QuestionUpdateData, body: Request["body"]) => {
  if (body.type === undefined) return null;
  const type = String(body.type ?? "") as QuestionType;
  if (!QUESTION_TYPES.includes(type)) return "Invalid question type";
  data.type = type;
  return null;
};

const applyRequiredUpdate = (data: QuestionUpdateData, body: Request["body"]) => {
  if (body.required === undefined) return;
  data.required = body.required === true || body.required === "true";
};

const applyOrderUpdate = (data: QuestionUpdateData, body: Request["body"]) => {
  if (body.order === undefined) return null;
  const orderValue = Number(body.order);
  if (!Number.isFinite(orderValue)) return "Invalid order value";
  data.order = orderValue;
  return null;
};

const applySectionUpdate = (data: QuestionUpdateData, body: Request["body"]) => {
  if (body.sectionId === undefined) return;
  const sectionId = String(body.sectionId ?? "").trim();
  if (!sectionId) return "Invalid section";
  data.sectionId = sectionId;
  return null;
};

const parseQuestionUpdatePayload = (
  body: Request["body"],
  currentType: QuestionType,
) : ParsedQuestionUpdatePayload => {
  const data: QuestionUpdateData = {};

  const titleError = applyTitleUpdate(data, body);
  if (titleError) return { error: titleError };

  applyDescriptionUpdate(data, body);

  const typeError = applyTypeUpdate(data, body);
  if (typeError) return { error: typeError };

  applyRequiredUpdate(data, body);

  const orderError = applyOrderUpdate(data, body);
  if (orderError) return { error: orderError };

  const sectionError = applySectionUpdate(data, body);
  if (sectionError) return { error: sectionError };

  const nextType = data.type ?? currentType;
  const options = body.options === undefined ? null : parseOptions(body.options);

  if (requiresOptions(nextType) && options !== null && options.length === 0) {
    return { error: "Options are required for this type" };
  }

  return { data, nextType, options };
};

const getDefaultSection = async (formId: string) => {
  let section = await prisma.section.findFirst({
    where: { formId },
    orderBy: { order: "asc" },
  });
  if (!section) {
    section = await prisma.section.create({
      data: {
        formId,
        title: "Section 1",
        order: 0,
      },
    });
  }
  return section;
};

const resolveSectionId = async (formId: string, rawSectionId?: unknown) => {
  if (rawSectionId === undefined || rawSectionId === null) {
    const fallback = await getDefaultSection(formId);
    return { sectionId: fallback.id };
  }
  const sectionId = String(rawSectionId ?? "").trim();
  if (!sectionId) {
    return { error: "Invalid section" };
  }
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true, formId: true },
  });
  if (!section || section.formId !== formId) {
    return { error: "Invalid section" };
  }
  return { sectionId: section.id };
};

const ensureEditableQuestion = async (
  question: { id: string; formId: string },
  userId: string,
) => {
  const access = await canEditForm(userId, question.formId);
  if (!access.ok) return { error: access.error };

  const answerCount = await prisma.answer.count({
    where: { questionId: question.id },
  });
  if (answerCount > 0) {
    return {
      error: {
        status: 409,
        message: "This question already has responses and can no longer be modified.",
      },
    };
  }

  return { ok: true as const };
};

export const listQuestions = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const access = await canReadForm(req.user?.id ?? null, formId);
  if (!access.ok) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  const questions = await prisma.question.findMany({
    where: { formId },
    orderBy: [{ section: { order: "asc" } }, { order: "asc" }],
    include: { options: { orderBy: { order: "asc" } } },
  });

  return res.json({ data: questions });
};

export const createQuestion = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const access = await canEditForm(req.user!.id, formId);
  if (!access.ok) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  const resolvedSection = await resolveSectionId(formId, req.body.sectionId);
  if ("error" in resolvedSection) {
    return res.status(400).json({ message: resolvedSection.error });
  }

  const title = String(req.body.title ?? "").trim();
  const descriptionRaw = req.body.description;
  const description =
    descriptionRaw === null || descriptionRaw === undefined
      ? null
      : String(descriptionRaw).trim();
  const type = String(req.body.type ?? "") as QuestionType;
  const required = req.body.required === true || req.body.required === "true";
  const orderValue = Number(req.body.order);
  const order = Number.isFinite(orderValue)
    ? orderValue
    : await prisma.question.count({ where: { sectionId: resolvedSection.sectionId } });
  const options = parseOptions(req.body.options);

  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }
  if (!QUESTION_TYPES.includes(type)) {
    return res.status(400).json({ message: "Invalid question type" });
  }
  if (requiresOptions(type) && (!options || options.length === 0)) {
    return res.status(400).json({ message: "Options are required for this type" });
  }

  const question = await prisma.question.create({
    data: {
      formId,
      sectionId: resolvedSection.sectionId,
      title,
      description,
      type,
      required,
      order,
      options: requiresOptions(type)
        ? {
            create: (options ?? []).map((label, index) => ({
              label,
              order: index,
            })),
          }
        : undefined,
    },
    include: { options: { orderBy: { order: "asc" } } },
  });

  return res.status(201).json({ data: question });
};

export const updateQuestion = async (req: Request, res: Response) => {
  const questionId = String(req.params.id);
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, formId: true, type: true, sectionId: true },
  });
  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  const guard = await ensureEditableQuestion(question, req.user!.id);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  const parsed = parseQuestionUpdatePayload(req.body, question.type as QuestionType);
  if ("error" in parsed) {
    return res.status(400).json({ message: parsed.error });
  }

  const { data, nextType, options } = parsed;
  const nextSectionId = data.sectionId ?? question.sectionId;

  if (data.sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: data.sectionId },
      select: { id: true, formId: true },
    });
    if (!section || section.formId !== question.formId) {
      return res.status(400).json({ message: "Invalid section" });
    }
  }

  if (data.sectionId && data.sectionId !== question.sectionId && data.order === undefined) {
    data.order = await prisma.question.count({ where: { sectionId: nextSectionId } });
  }

  const shouldResetOptions =
    req.body.options !== undefined || !requiresOptions(nextType);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: questionId },
      data: data,
    });

    if (shouldResetOptions) {
      await tx.option.deleteMany({ where: { questionId } });
      if (requiresOptions(nextType) && options && options.length > 0) {
        await tx.option.createMany({
          data: options.map((label, index) => ({
            questionId,
            label,
            order: index,
          })),
        });
      }
    }

    return tx.question.findUnique({
      where: { id: questionId },
      include: { options: { orderBy: { order: "asc" } } },
    });
  });

  return res.json({ data: updated });
};

export const deleteQuestion = async (req: Request, res: Response) => {
  const questionId = String(req.params.id);
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, formId: true },
  });
  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  const guard = await ensureEditableQuestion(question, req.user!.id);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  await prisma.question.delete({ where: { id: questionId } });
  return res.status(204).send();
};
