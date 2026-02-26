import { httpError } from "../../shared/errors/httpError";
import { responsesRepository } from "./responses.repository";

type OwnerGuardForm = {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
};

type SummaryQuestion = Awaited<
  ReturnType<typeof responsesRepository.findQuestionsForSummary>
>[number];
type SummaryQuestionOption = SummaryQuestion["options"][number];

const ensureOwner = async (formId: string, userId: string): Promise<OwnerGuardForm> => {
  const form = await responsesRepository.findFormOwnerBrief(formId);
  if (!form) {
    throw httpError(404, "Form not found");
  }
  if (form.ownerId !== userId) {
    throw httpError(403, "Forbidden");
  }
  return form;
};

const parsePagination = (query: { page?: unknown; limit?: unknown }) => {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);
  const usePagination = query.page !== undefined || query.limit !== undefined;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;
  return { usePagination, page, limit };
};

export const listResponsesForOwner = async ({
  formId,
  userId,
  query,
}: {
  formId: string;
  userId: string;
  query: { page?: unknown; limit?: unknown };
}) => {
  const form = await ensureOwner(formId, userId);
  const { usePagination, page, limit } = parsePagination(query);

  if (!usePagination) {
    const responses = await responsesRepository.findResponsesWithAnswers({ formId });
    return { data: responses, form };
  }

  const skip = (page - 1) * limit;
  const [total, responses] = await Promise.all([
    responsesRepository.countResponses(formId),
    responsesRepository.findResponsesWithAnswers({ formId, skip, take: limit }),
  ]);

  return {
    data: responses,
    form,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const getResponseDetailForOwner = async ({
  formId,
  responseId,
  userId,
}: {
  formId: string;
  responseId: string;
  userId: string;
}) => {
  const form = await ensureOwner(formId, userId);
  const responseRecord = await responsesRepository.findResponseDetailById(responseId);

  if (!responseRecord || responseRecord.formId !== formId) {
    throw httpError(404, "Response not found");
  }

  return { data: responseRecord, form };
};

export const getFormSummaryForOwner = async ({
  formId,
  userId,
}: {
  formId: string;
  userId: string;
}) => {
  const form = await ensureOwner(formId, userId);

  const [questions, answers] = await Promise.all([
    responsesRepository.findQuestionsForSummary(formId),
    responsesRepository.findAnswersForSummary(formId),
  ]);

  const answersByQuestion = new Map<
    string,
    Array<{ optionId: string | null; text: string | null }>
  >();
  answers.forEach((answer) => {
    const existing = answersByQuestion.get(answer.questionId) ?? [];
    existing.push({ optionId: answer.optionId ?? null, text: answer.text ?? null });
    answersByQuestion.set(answer.questionId, existing);
  });

  const summary = questions.map((question) => {
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
    const opts: SummaryQuestionOption[] = question.options ?? [];

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

  return { data: summary, form };
};

export const deleteResponseForOwner = async ({
  formId,
  responseId,
  userId,
}: {
  formId: string;
  responseId: string;
  userId: string;
}) => {
  await ensureOwner(formId, userId);

  const responseRecord = await responsesRepository.findResponseRef(responseId);
  if (responseRecord?.formId !== formId) {
    throw httpError(404, "Response not found");
  }

  await responsesRepository.deleteResponse(responseId);
};
