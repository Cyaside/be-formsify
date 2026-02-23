import type { Request, Response } from "express";
import prisma from "../lib/prisma";

type AnswerPayload = {
  questionId: string;
  optionId?: unknown;
  text?: unknown;
};

type Question = {
  id: string;
  title: string;
  type: "SHORT_ANSWER" | "MCQ" | "CHECKBOX" | "DROPDOWN";
  required: boolean;
  options: Array<{ id: string }>;
};

type PreparedAnswer = { questionId: string; optionId?: string; text?: string };

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeOptionId = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const requiredQuestionMessage = (questionTitle: string) =>
  `Pertanyaan wajib belum dijawab: ${questionTitle}`;

const invalidAnswerMessage = (questionTitle: string) =>
  `Jawaban tidak valid untuk pertanyaan: ${questionTitle}`;

const toOptionIds = (entries: AnswerPayload[]) =>
  entries
    .map((entry) => normalizeOptionId(entry.optionId))
    .filter((value): value is string => Boolean(value));

const findInvalidOption = (optionIds: string[], optionSet: Set<string>) =>
  optionIds.find((optionId) => !optionSet.has(optionId));

const prepareShortAnswer = (question: Question, entries: AnswerPayload[]) => {
  const texts = entries
    .map((entry) => normalizeText(entry.text))
    .filter((text) => text.length > 0);

  if (question.required && texts.length === 0) {
    return {
      error: requiredQuestionMessage(question.title),
      answers: [] as PreparedAnswer[],
    };
  }

  return {
    answers: texts.length > 0 ? [{ questionId: question.id, text: texts[0] }] : [],
  };
};

const prepareSingleChoice = (question: Question, optionIds: string[]) => {
  if (question.required && optionIds.length === 0) {
    return {
      error: requiredQuestionMessage(question.title),
      answers: [] as PreparedAnswer[],
    };
  }

  return {
    answers: optionIds.length > 0 ? [{ questionId: question.id, optionId: optionIds[0] }] : [],
  };
};

const prepareCheckbox = (question: Question, optionIds: string[]) => {
  const uniqueOptionIds = Array.from(new Set(optionIds));
  if (question.required && uniqueOptionIds.length === 0) {
    return {
      error: requiredQuestionMessage(question.title),
      answers: [] as PreparedAnswer[],
    };
  }

  return {
    answers: uniqueOptionIds.map((optionId) => ({ questionId: question.id, optionId })),
  };
};

const prepareQuestionAnswers = (question: Question, entries: AnswerPayload[]) => {
  if (question.type === "SHORT_ANSWER") {
    return prepareShortAnswer(question, entries);
  }

  const optionSet = new Set(question.options.map((opt) => opt.id));
  const optionIds = toOptionIds(entries);
  const invalidOption = findInvalidOption(optionIds, optionSet);
  if (invalidOption) {
    return {
      error: invalidAnswerMessage(question.title),
      answers: [] as PreparedAnswer[],
    };
  }

  if (question.type === "CHECKBOX") {
    return prepareCheckbox(question, optionIds);
  }

  return prepareSingleChoice(question, optionIds);
};

export const submitForm = async (req: Request, res: Response) => {
  const formId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      questions: { include: { options: true } },
    },
  });

  if (!form) {
    return res.status(404).json({ message: "Form not found" });
  }

  if (!form.isPublished) {
    return res.status(404).json({ message: "Form not found" });
  }
  if (form.isClosed) {
    return res.status(409).json({ message: "Form ini sudah ditutup dan tidak menerima respons." });
  }

  if (typeof form.responseLimit === "number") {
    const totalResponses = await prisma.response.count({
      where: { formId: form.id },
    });
    if (totalResponses >= form.responseLimit) {
      return res.status(409).json({
        message: `Batas respons form ini sudah tercapai (${form.responseLimit}).`,
      });
    }
  }

  const rawAnswers = Array.isArray(req.body.answers) ? req.body.answers : [];
  const answers = rawAnswers.filter(
    (item: AnswerPayload) => item && typeof item.questionId === "string",
  ) as AnswerPayload[];

  const answersByQuestion = new Map<string, AnswerPayload[]>();
  for (const answer of answers) {
    const existing = answersByQuestion.get(answer.questionId) ?? [];
    existing.push(answer);
    answersByQuestion.set(answer.questionId, existing);
  }

  const preparedAnswers: PreparedAnswer[] = [];

  for (const question of form.questions) {
    const entries = answersByQuestion.get(question.id) ?? [];
    const prepared = prepareQuestionAnswers(question as Question, entries);
    if (prepared.error) {
      return res.status(400).json({ message: prepared.error });
    }

    preparedAnswers.push(...prepared.answers);
  }

  const responseRecord = await prisma.response.create({
    data: {
      formId: form.id,
      answers: {
        create: preparedAnswers.map((answer) => ({
          questionId: answer.questionId,
          optionId: answer.optionId,
          text: answer.text,
        })),
      },
    },
    include: { answers: true },
  });

  return res.status(201).json({ data: responseRecord });
};
