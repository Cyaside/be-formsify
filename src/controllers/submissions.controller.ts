import type { Request, Response } from "express";
import prisma from "../lib/prisma";

type AnswerPayload = {
  questionId: string;
  value: unknown;
};

type Question = {
  id: string;
  title: string;
  type: string;
  required: boolean;
  options: Array<{ id: string }>;
};

const isNonEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

const validateRequiredAnswer = (
  question: Question,
  value: unknown,
): string | null => {
  if (question.required && isEmpty(value)) {
    return `Pertanyaan wajib belum dijawab: ${question.title}`;
  }
  return null;
};

const validateShortText = (
  question: Question,
  value: unknown,
): { valid: boolean; processedValue?: string } => {
  if (!isNonEmptyString(value)) {
    return { valid: false };
  }
  return { valid: true, processedValue: String(value) };
};

const validateMultipleChoice = (
  question: Question,
  value: unknown,
): { valid: boolean; processedValue?: string } => {
  const optionIds = new Set(question.options.map((opt) => opt.id));
  if (typeof value !== "string" || !optionIds.has(value)) {
    return { valid: false };
  }
  return { valid: true, processedValue: value };
};

const validateCheckbox = (
  question: Question,
  value: unknown,
): { valid: boolean; processedValue?: unknown[] } => {
  if (!Array.isArray(value)) {
    return { valid: false };
  }
  const optionIds = new Set(question.options.map((opt) => opt.id));
  const selected = value.filter((item) => typeof item === "string");
  if (selected.some((item) => !optionIds.has(item))) {
    return { valid: false };
  }
  return { valid: true, processedValue: selected };
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
    (item: AnswerPayload) =>
      item && typeof item.questionId === "string" && "value" in item,
  ) as AnswerPayload[];

  const answerMap = new Map<string, unknown>();
  for (const answer of answers) {
    answerMap.set(answer.questionId, answer.value);
  }

  const preparedAnswers: { questionId: string; value: unknown }[] = [];

  for (const question of form.questions) {
    const value = answerMap.get(question.id);

    const requiredError = validateRequiredAnswer(question, value);
    if (requiredError) {
      return res.status(400).json({ message: requiredError });
    }

    if (isEmpty(value)) {
      continue;
    }

    if (question.type === "SHORT_TEXT") {
      const result = validateShortText(question, value);
      if (!result.valid) {
        return res.status(400).json({
          message: `Jawaban tidak valid untuk pertanyaan: ${question.title}`,
        });
      }
      preparedAnswers.push({
        questionId: question.id,
        value: result.processedValue,
      });
    } else if (
      question.type === "MULTIPLE_CHOICE" ||
      question.type === "DROPDOWN"
    ) {
      const result = validateMultipleChoice(question, value);
      if (!result.valid) {
        return res.status(400).json({
          message: `Jawaban tidak valid untuk pertanyaan: ${question.title}`,
        });
      }
      preparedAnswers.push({
        questionId: question.id,
        value: result.processedValue,
      });
    } else if (question.type === "CHECKBOX") {
      const result = validateCheckbox(question, value);
      if (!result.valid) {
        return res.status(400).json({
          message: `Jawaban tidak valid untuk pertanyaan: ${question.title}`,
        });
      }
      preparedAnswers.push({
        questionId: question.id,
        value: result.processedValue,
      });
    }
  }

  const responseRecord = await prisma.response.create({
    data: {
      formId: form.id,
      answers: {
        create: preparedAnswers.map((answer) => ({
          value: JSON.parse(JSON.stringify(answer.value)),
          question: { connect: { id: answer.questionId } },
        })),
      },
    },
    include: { answers: true },
  });

  return res.status(201).json({ data: responseRecord });
};
