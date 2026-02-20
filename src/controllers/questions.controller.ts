import type { Request, Response } from "express";
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

  const nextType = data.type ?? currentType;
  const options = body.options === undefined ? null : parseOptions(body.options);

  if (requiresOptions(nextType) && options !== null && options.length === 0) {
    return { error: "Options are required for this type" };
  }

  return { data, nextType, options };
};

const ensureEditableForm = async (formId: string, userId: string) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { id: true, ownerId: true },
  });
  if (!form) {
    return { error: { status: 404, message: "Form not found" } };
  }
  if (form.ownerId !== userId) {
    return { error: { status: 403, message: "Forbidden" } };
  }
  const responseCount = await prisma.response.count({ where: { formId } });
  if (responseCount > 0) {
    return {
      error: {
        status: 409,
        message: "Form sudah memiliki respons dan tidak bisa diubah.",
      },
    };
  }
  return { form };
};

export const listQuestions = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form) {
    return res.status(404).json({ message: "Form not found" });
  }

  const isOwner = req.user?.id === form.ownerId;
  if (!form.isPublished && !isOwner) {
    return res.status(404).json({ message: "Form not found" });
  }

  const questions = await prisma.question.findMany({
    where: { formId },
    orderBy: { order: "asc" },
    include: { options: { orderBy: { order: "asc" } } },
  });

  return res.json({ data: questions });
};

export const createQuestion = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const guard = await ensureEditableForm(formId, req.user!.id);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
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
  const order = Number.isFinite(orderValue) ? orderValue : 0;
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
    include: { form: true },
  });
  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  const guard = await ensureEditableForm(question.formId, req.user!.id);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  const parsed = parseQuestionUpdatePayload(req.body, question.type as QuestionType);
  if ("error" in parsed) {
    return res.status(400).json({ message: parsed.error });
  }

  const { data, nextType, options } = parsed;

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
    include: { form: true },
  });
  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  const guard = await ensureEditableForm(question.formId, req.user!.id);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  await prisma.question.delete({ where: { id: questionId } });
  return res.status(204).send();
};
