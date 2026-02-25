import prisma from "../../lib/prisma";
import {
  groupValidAnswerPayloads,
  prepareQuestionAnswers,
  type PreparedAnswer,
  type SubmissionQuestion,
} from "./submissions.policy";

export class SubmissionHttpError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(typeof payload.message === "string" ? payload.message : `HTTP ${status}`);
    this.name = "SubmissionHttpError";
    this.status = status;
    this.payload = payload;
  }
}

const submissionError = (status: number, message: string) =>
  new SubmissionHttpError(status, { message });

export const submitFormResponse = async ({
  formId,
  rawAnswers,
}: {
  formId: string;
  rawAnswers: unknown;
}) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      questions: { include: { options: true } },
    },
  });

  if (!form) {
    throw submissionError(404, "Form not found");
  }

  if (!form.isPublished) {
    throw submissionError(404, "Form not found");
  }
  if (form.isClosed) {
    throw submissionError(409, "This form is closed and no longer accepts responses.");
  }

  if (typeof form.responseLimit === "number") {
    const totalResponses = await prisma.response.count({
      where: { formId: form.id },
    });
    if (totalResponses >= form.responseLimit) {
      throw submissionError(
        409,
        `This form has reached its response limit (${form.responseLimit}).`,
      );
    }
  }

  const answersByQuestion = groupValidAnswerPayloads(rawAnswers);
  const preparedAnswers: PreparedAnswer[] = [];

  for (const question of form.questions) {
    const entries = answersByQuestion.get(question.id) ?? [];
    const prepared = prepareQuestionAnswers(question as SubmissionQuestion, entries);
    if (prepared.error) {
      throw submissionError(400, prepared.error);
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

  return responseRecord;
};
