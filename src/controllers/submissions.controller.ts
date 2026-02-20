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
  type: string;
  required: boolean;
  options: Array<{ id: string }>;
};

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeOptionId = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

  const preparedAnswers: Array<{ questionId: string; optionId?: string; text?: string }> = [];

  for (const question of form.questions) {
    const entries = answersByQuestion.get(question.id) ?? [];
    const optionSet = new Set(question.options.map((opt) => opt.id));

    if (question.type === "SHORT_ANSWER") {
      const texts = entries
        .map((entry) => normalizeText(entry.text))
        .filter((text) => text.length > 0);

      if (question.required && texts.length === 0) {
        return res.status(400).json({
          message: `Pertanyaan wajib belum dijawab: ${question.title}`,
        });
      }
      if (texts.length === 0) {
        continue;
      }

      preparedAnswers.push({ questionId: question.id, text: texts[0] });
      continue;
    }

    const optionIds = entries
      .map((entry) => normalizeOptionId(entry.optionId))
      .filter((value): value is string => Boolean(value));

    const invalidOption = optionIds.find((optionId) => !optionSet.has(optionId));
    if (invalidOption) {
      return res.status(400).json({
        message: `Jawaban tidak valid untuk pertanyaan: ${question.title}`,
      });
    }

    if (question.type === "MCQ" || question.type === "DROPDOWN") {
      if (question.required && optionIds.length === 0) {
        return res.status(400).json({
          message: `Pertanyaan wajib belum dijawab: ${question.title}`,
        });
      }
      if (optionIds.length === 0) {
        continue;
      }
      preparedAnswers.push({ questionId: question.id, optionId: optionIds[0] });
      continue;
    }

    if (question.type === "CHECKBOX") {
      const uniqueOptionIds = Array.from(new Set(optionIds));
      if (question.required && uniqueOptionIds.length === 0) {
        return res.status(400).json({
          message: `Pertanyaan wajib belum dijawab: ${question.title}`,
        });
      }
      if (uniqueOptionIds.length === 0) {
        continue;
      }

      uniqueOptionIds.forEach((optionId) => {
        preparedAnswers.push({ questionId: question.id, optionId });
      });
    }
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
