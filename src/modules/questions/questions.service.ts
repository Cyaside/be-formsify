import { canEditForm, canReadForm } from "../../shared/access/formAccess";
import { httpError } from "../../shared/errors/httpError";
import { questionsPrisma, questionsRepository } from "./questions.repository";

const QUESTION_TYPES = ["SHORT_ANSWER", "PARAGRAPH", "MCQ", "CHECKBOX", "DROPDOWN"] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];
type QuestionBody = Record<string, unknown>;

const requiresOptions = (type: QuestionType) =>
  type === "MCQ" || type === "CHECKBOX" || type === "DROPDOWN";

const hasPrismaErrorCode = (error: unknown, code: string) => {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === "string" && maybeCode === code;
};

const isMissingParagraphEnumMigration = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("questiontype") &&
    message.includes("paragraph") &&
    (message.includes("invalid input value for enum") ||
      message.includes("value \"paragraph\" not found"))
  );
};

const mapQuestionPersistenceError = (error: unknown) => {
  if (hasPrismaErrorCode(error, "P2025")) {
    return httpError(404, "Question not found");
  }
  if (isMissingParagraphEnumMigration(error)) {
    return httpError(
      500,
      "Database schema is outdated (QuestionType.PARAGRAPH missing). Run `prisma migrate deploy`.",
    );
  }
  return null;
};

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

const applyTitleUpdate = (data: QuestionUpdateData, body: QuestionBody) => {
  if (body.title === undefined) return null;
  const title = String(body.title ?? "").trim();
  if (!title) return "Title cannot be empty";
  data.title = title;
  return null;
};

const applyDescriptionUpdate = (data: QuestionUpdateData, body: QuestionBody) => {
  if (body.description === undefined) return;
  data.description = body.description === null ? null : String(body.description).trim();
};

const applyTypeUpdate = (data: QuestionUpdateData, body: QuestionBody) => {
  if (body.type === undefined) return null;
  const type = String(body.type ?? "") as QuestionType;
  if (!QUESTION_TYPES.includes(type)) return "Invalid question type";
  data.type = type;
  return null;
};

const applyRequiredUpdate = (data: QuestionUpdateData, body: QuestionBody) => {
  if (body.required === undefined) return;
  data.required = body.required === true || body.required === "true";
};

const applyOrderUpdate = (data: QuestionUpdateData, body: QuestionBody) => {
  if (body.order === undefined) return null;
  const orderValue = Number(body.order);
  if (!Number.isFinite(orderValue)) return "Invalid order value";
  data.order = orderValue;
  return null;
};

const applySectionUpdate = (data: QuestionUpdateData, body: QuestionBody) => {
  if (body.sectionId === undefined) return null;
  const sectionId = String(body.sectionId ?? "").trim();
  if (!sectionId) return "Invalid section";
  data.sectionId = sectionId;
  return null;
};

const parseQuestionUpdatePayload = (
  body: QuestionBody,
  currentType: QuestionType,
): ParsedQuestionUpdatePayload => {
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
  let section = await questionsRepository.findFirstSectionByForm(formId);
  if (!section) {
    section = await questionsRepository.createDefaultSection(formId);
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
  const section = await questionsRepository.findSectionRef(sectionId);
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

  const answerCount = await questionsRepository.countAnswersByQuestion(question.id);
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

export const listQuestionsForForm = async ({
  formId,
  userId,
}: {
  formId: string;
  userId: string | null | undefined;
}) => {
  const access = await canReadForm(userId ?? null, formId);
  if (!access.ok) throw httpError(access.error.status, access.error.message);

  const questions = await questionsRepository.listQuestionsByForm(formId);
  return { data: questions };
};

export const createQuestionForForm = async ({
  formId,
  userId,
  body,
}: {
  formId: string;
  userId: string;
  body: QuestionBody;
}) => {
  const access = await canEditForm(userId, formId);
  if (!access.ok) throw httpError(access.error.status, access.error.message);

  const resolvedSection = await resolveSectionId(formId, body.sectionId);
  if ("error" in resolvedSection && typeof resolvedSection.error === "string") {
    throw httpError(400, resolvedSection.error);
  }

  const title = String(body.title ?? "").trim();
  const descriptionRaw = body.description;
  const description =
    descriptionRaw === null || descriptionRaw === undefined
      ? null
      : String(descriptionRaw).trim();
  const type = String(body.type ?? "") as QuestionType;
  const required = body.required === true || body.required === "true";
  const orderValue = Number(body.order);
  const order = Number.isFinite(orderValue)
    ? orderValue
    : await questionsRepository.countQuestionsBySection(resolvedSection.sectionId);
  const options = parseOptions(body.options);

  if (!title) throw httpError(400, "Title is required");
  if (!QUESTION_TYPES.includes(type)) throw httpError(400, "Invalid question type");
  if (requiresOptions(type) && (!options || options.length === 0)) {
    throw httpError(400, "Options are required for this type");
  }

  let question;
  try {
    question = await questionsRepository.createQuestion({
      formId,
      sectionId: resolvedSection.sectionId,
      title,
      description,
      type,
      required,
      order,
      options: requiresOptions(type) ? options : null,
    });
  } catch (error) {
    const mapped = mapQuestionPersistenceError(error);
    if (mapped) throw mapped;
    throw error;
  }

  return { data: question };
};

export const updateQuestionByIdForUser = async ({
  questionId,
  userId,
  body,
}: {
  questionId: string;
  userId: string;
  body: QuestionBody;
}) => {
  const question = await questionsRepository.findQuestionRef(questionId);
  if (!question) throw httpError(404, "Question not found");

  const guard = await ensureEditableQuestion(question, userId);
  const guardError = "error" in guard ? guard.error : undefined;
  if (guardError) throw httpError(guardError.status, guardError.message);

  const parsed = parseQuestionUpdatePayload(body, question.type as QuestionType);
  if ("error" in parsed) throw httpError(400, parsed.error);

  const { data, nextType, options } = parsed;
  const nextSectionId = data.sectionId ?? question.sectionId;

  if (data.sectionId) {
    const section = await questionsRepository.findSectionRef(data.sectionId);
    if (!section || section.formId !== question.formId) {
      throw httpError(400, "Invalid section");
    }
  }

  if (data.sectionId && data.sectionId !== question.sectionId && data.order === undefined) {
    data.order = await questionsRepository.countQuestionsBySection(nextSectionId);
  }

  const shouldResetOptions = body.options !== undefined || !requiresOptions(nextType);

  let updated;
  try {
    updated = await questionsPrisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: questionId },
        data,
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
  } catch (error) {
    const mapped = mapQuestionPersistenceError(error);
    if (mapped) throw mapped;
    throw error;
  }

  return { data: updated };
};

export const deleteQuestionByIdForUser = async ({
  questionId,
  userId,
}: {
  questionId: string;
  userId: string;
}) => {
  const question = await questionsRepository.findQuestionRef(questionId);
  if (!question) throw httpError(404, "Question not found");

  const guard = await ensureEditableQuestion(question, userId);
  const guardError = "error" in guard ? guard.error : undefined;
  if (guardError) throw httpError(guardError.status, guardError.message);

  await questionsRepository.deleteQuestion(questionId);
};

