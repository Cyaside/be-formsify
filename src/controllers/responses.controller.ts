import type { Request, Response } from "express";
import prisma from "../lib/prisma";

const ensureOwner = async (formId: string, userId: string) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { id: true, ownerId: true, title: true, description: true },
  });
  if (!form) {
    return { error: { status: 404, message: "Form not found" } };
  }
  if (form.ownerId !== userId) {
    return { error: { status: 403, message: "Forbidden" } };
  }
  return { form };
};

export const listResponses = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const userId = String(req.user!.id);
  const guard = await ensureOwner(formId, userId);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  const responses = await prisma.response.findMany({
    where: { formId },
    orderBy: { createdAt: "desc" },
    include: {
      answers: {
        include: { question: { include: { options: true } } },
      },
    },
  });

  return res.json({ data: responses, form: guard.form });
};

export const getSummary = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const userId = String(req.user!.id);
  const guard = await ensureOwner(formId, userId);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  const questions = await prisma.question.findMany({
    where: { formId },
    include: { options: true },
    orderBy: { order: "asc" },
  });

  const answers = await prisma.answer.findMany({
    where: { response: { is: { formId } } },
    select: { questionId: true, optionId: true, text: true },
  });

  const answersByQuestion = new Map<
    string,
    Array<{ optionId: string | null; text: string | null }>
  >();
  answers.forEach((answer) => {
    const existing = answersByQuestion.get(answer.questionId) ?? [];
    existing.push({ optionId: answer.optionId ?? null, text: answer.text ?? null });
    answersByQuestion.set(answer.questionId, existing);
  });

  const summary = (questions as any[]).map((question) => {
    const questionAnswers = answersByQuestion.get(question.id) ?? [];
    if (question.type === "SHORT_ANSWER") {
      return {
        questionId: question.id,
        title: question.title,
        type: question.type,
        totalAnswers: questionAnswers.filter((answer) => {
          return typeof answer.text === "string" && answer.text.trim().length > 0;
        }).length,
      };
    }
    const opts = (question.options ?? []) as any[];

    const counts: Record<string, number> = {};
    opts.forEach((option) => {
      counts[option.id] = 0;
    });

    questionAnswers.forEach((answer) => {
      if (answer.optionId && answer.optionId in counts) {
        counts[answer.optionId] += 1;
      }
    });

    return {
      questionId: question.id,
      title: question.title,
      type: question.type,
      options: opts.map((option) => ({
        id: option.id,
        label: option.label,
        count: counts[option.id] ?? 0,
      })),
    };
  });

  return res.json({ data: summary, form: guard.form });
};

export const deleteResponse = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const responseId = String(req.params.responseId);
  const userId = String(req.user!.id);

  const guard = await ensureOwner(formId, userId);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  const responseRecord = await prisma.response.findUnique({
    where: { id: responseId },
    select: { id: true, formId: true },
  });

  if (responseRecord?.formId !== formId) {
    return res.status(404).json({ message: "Response not found" });
  }

  await prisma.response.delete({ where: { id: responseId } });
  return res.status(204).send();
};
