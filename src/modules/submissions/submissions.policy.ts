export type AnswerPayload = {
  questionId: string;
  optionId?: unknown;
  text?: unknown;
};

export type SubmissionQuestion = {
  id: string;
  title: string;
  type: "SHORT_ANSWER" | "PARAGRAPH" | "MCQ" | "CHECKBOX" | "DROPDOWN";
  required: boolean;
  options: Array<{ id: string }>;
};

export type PreparedAnswer = { questionId: string; optionId?: string; text?: string };

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeOptionId = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const requiredQuestionMessage = (questionTitle: string) =>
  `Required question not answered: ${questionTitle}`;

const invalidAnswerMessage = (questionTitle: string) =>
  `Invalid answer for question: ${questionTitle}`;

const shortAnswerMaxLength = 100;
const paragraphMaxLength = 1000;

const toOptionIds = (entries: AnswerPayload[]) =>
  entries
    .map((entry) => normalizeOptionId(entry.optionId))
    .filter((value): value is string => Boolean(value));

const findInvalidOption = (optionIds: string[], optionSet: Set<string>) =>
  optionIds.find((optionId) => !optionSet.has(optionId));

const prepareShortAnswer = (question: SubmissionQuestion, entries: AnswerPayload[]) => {
  const texts = entries
    .map((entry) => normalizeText(entry.text))
    .filter((text) => text.length > 0);
  const maxLength =
    question.type === "PARAGRAPH" ? paragraphMaxLength : shortAnswerMaxLength;
  const exceedsLimit = texts.some((text) => text.length > maxLength);
  if (exceedsLimit) {
    return {
      error: invalidAnswerMessage(question.title),
      answers: [] as PreparedAnswer[],
    };
  }

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

const prepareSingleChoice = (question: SubmissionQuestion, optionIds: string[]) => {
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

const prepareCheckbox = (question: SubmissionQuestion, optionIds: string[]) => {
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

export const prepareQuestionAnswers = (question: SubmissionQuestion, entries: AnswerPayload[]) => {
  if (question.type === "SHORT_ANSWER" || question.type === "PARAGRAPH") {
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

export const groupValidAnswerPayloads = (rawAnswers: unknown): Map<string, AnswerPayload[]> => {
  const answers = (Array.isArray(rawAnswers) ? rawAnswers : []).filter(
    (item: AnswerPayload) => item && typeof item.questionId === "string",
  ) as AnswerPayload[];

  const answersByQuestion = new Map<string, AnswerPayload[]>();
  for (const answer of answers) {
    const existing = answersByQuestion.get(answer.questionId) ?? [];
    existing.push(answer);
    answersByQuestion.set(answer.questionId, existing);
  }

  return answersByQuestion;
};
