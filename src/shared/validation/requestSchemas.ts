import { strictObject, v } from "./requestValidation";

const MAX_TEXT_SHORT = 200;
const MAX_TEXT_MEDIUM = 500;
const MAX_TEXT_LONG = 5000;
const MAX_ANSWER_TEXT = 5000;
const MAX_OPTIONS = 100;
const MAX_ANSWERS_PER_SUBMISSION = 1000;
const MAX_BUILDER_SECTIONS = 200;
const MAX_BUILDER_QUESTIONS = 5000;

const emptyObject = strictObject({});

const idParams = strictObject({
  id: v.id(),
});

const idAndResponseParams = strictObject({
  id: v.id(),
  responseId: v.id(),
});

const idAndUserIdParams = strictObject({
  id: v.id(),
  userId: v.id(),
});

const sectionIdOptional = v.optional(v.nullable(v.id()));
const emailParser = v.string({
  toLowerCase: true,
  maxLength: 254,
  minLength: 3,
  pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  patternMessage: "Invalid email format",
});

const stringOrNull = (maxLength: number) =>
  v.nullable(v.string({ maxLength, allowEmpty: true }));

const optionalStringOrNull = (maxLength: number) => v.optional(stringOrNull(maxLength));

const optionalLooseString = (maxLength: number) =>
  v.optional(v.string({ maxLength, allowEmpty: true }));

const optionalBool = () => v.optional(v.boolean({ coerceString: true }));
const optionalInt = (min: number, max: number) =>
  v.optional(v.number({ integer: true, min, max, coerceString: true }));

const optionLabelParser = v.string({ maxLength: MAX_TEXT_SHORT, allowEmpty: false });

const optionsArrayParser = v.array(optionLabelParser, {
  maxLength: MAX_OPTIONS,
});

const answerEntryParser = strictObject({
  questionId: v.id(),
  optionId: v.optional(v.nullable(v.id())),
  text: v.optional(v.nullable(v.string({ maxLength: MAX_ANSWER_TEXT, allowEmpty: true }))),
});

const builderSnapshotSectionParser = strictObject({
  id: v.id(),
  title: v.string({ maxLength: MAX_TEXT_SHORT, allowEmpty: true }),
  description: optionalStringOrNull(MAX_TEXT_LONG),
  order: optionalInt(0, 1_000_000),
});

const builderSnapshotQuestionParser = strictObject({
  id: v.id(),
  sectionId: v.id(),
  title: v.string({ maxLength: MAX_TEXT_MEDIUM, allowEmpty: true }),
  description: optionalStringOrNull(MAX_TEXT_LONG),
  type: v.enum(["SHORT_ANSWER", "MCQ", "CHECKBOX", "DROPDOWN"] as const),
  required: v.boolean({ coerceString: true }),
  order: optionalInt(0, 1_000_000),
  options: v.optional(optionsArrayParser),
});

export const schemas = {
  emptyQuery: emptyObject,
  emptyBody: emptyObject,
  idParams,
  idAndResponseParams,
  idAndUserIdParams,

  rootRegisterBody: strictObject({
    email: emailParser,
    password: v.string({ minLength: 6, maxLength: 128 }),
    name: v.optional(v.string({ maxLength: 100, allowEmpty: true })),
  }),

  rootLoginBody: strictObject({
    email: emailParser,
    password: v.string({ minLength: 1, maxLength: 128 }),
  }),

  googleAuthBody: strictObject({
    idToken: v.optional(v.string({ maxLength: 4096, allowEmpty: true })),
    code: v.optional(v.string({ maxLength: 4096, allowEmpty: true })),
  }),

  listFormsQuery: strictObject({
    search: v.optional(v.string({ maxLength: 200, allowEmpty: true })),
    status: v.optional(v.enum(["all", "published", "draft"] as const)),
    sort: v.optional(v.enum(["newest", "oldest"] as const)),
  }),

  listPublicFormsQuery: strictObject({
    page: optionalInt(1, 100_000),
    limit: optionalInt(1, 50),
  }),

  paginationQuery: strictObject({
    page: optionalInt(1, 100_000),
    limit: optionalInt(1, 50),
  }),

  analyticsQuery: strictObject({
    from: v.optional(v.dateOnly()),
    to: v.optional(v.dateOnly()),
    bucket: v.optional(v.enum(["day", "week", "month"] as const)),
  }),

  createFormBody: strictObject({
    title: v.string({ maxLength: MAX_TEXT_SHORT }),
    description: optionalStringOrNull(MAX_TEXT_LONG),
    thankYouTitle: optionalLooseString(MAX_TEXT_SHORT),
    thankYouMessage: optionalLooseString(MAX_TEXT_LONG),
    isPublished: optionalBool(),
    responseLimit: v.optional(v.nullable(v.number({ integer: true, min: 1, max: 100_000 }))),
    isClosed: optionalBool(),
  }),

  updateFormBody: strictObject({
    title: v.optional(v.string({ maxLength: MAX_TEXT_SHORT })),
    description: optionalStringOrNull(MAX_TEXT_LONG),
    thankYouTitle: optionalLooseString(MAX_TEXT_SHORT),
    thankYouMessage: optionalLooseString(MAX_TEXT_LONG),
    isPublished: optionalBool(),
    isClosed: optionalBool(),
    responseLimit: v.optional(
      v.nullable(v.number({ integer: true, min: 1, max: 100_000 })),
    ),
  }),

  createCollaboratorBody: strictObject({
    userId: v.optional(v.id()),
    email: v.optional(emailParser),
    role: v.optional(v.enum(["EDITOR"] as const)),
  }),

  updateCollaboratorBody: strictObject({
    role: v.enum(["EDITOR"] as const),
  }),

  updateBuilderSnapshotBody: strictObject({
    baseVersion: v.number({ integer: true, min: 0, coerceString: true }),
    snapshot: strictObject({
      title: v.string({ maxLength: MAX_TEXT_SHORT }),
      description: stringOrNull(MAX_TEXT_LONG),
      thankYouTitle: v.string({ maxLength: MAX_TEXT_SHORT, allowEmpty: true }),
      thankYouMessage: v.string({ maxLength: MAX_TEXT_LONG, allowEmpty: true }),
      isClosed: v.boolean({ coerceString: true }),
      responseLimit: v.nullable(v.number({ integer: true, min: 1, max: 100_000 })),
      sections: v.array(builderSnapshotSectionParser, {
        minLength: 1,
        maxLength: MAX_BUILDER_SECTIONS,
      }),
      questions: v.array(builderSnapshotQuestionParser, {
        maxLength: MAX_BUILDER_QUESTIONS,
      }),
    }),
  }),

  createQuestionBody: strictObject({
    title: v.string({ maxLength: MAX_TEXT_MEDIUM }),
    description: optionalStringOrNull(MAX_TEXT_LONG),
    type: v.enum(["SHORT_ANSWER", "MCQ", "CHECKBOX", "DROPDOWN"] as const),
    required: optionalBool(),
    order: optionalInt(0, 1_000_000),
    sectionId: sectionIdOptional,
    options: v.optional(optionsArrayParser),
  }),

  updateQuestionBody: strictObject({
    title: v.optional(v.string({ maxLength: MAX_TEXT_MEDIUM })),
    description: optionalStringOrNull(MAX_TEXT_LONG),
    type: v.optional(v.enum(["SHORT_ANSWER", "MCQ", "CHECKBOX", "DROPDOWN"] as const)),
    required: optionalBool(),
    order: optionalInt(0, 1_000_000),
    sectionId: v.optional(v.id()),
    options: v.optional(optionsArrayParser),
  }),

  createSectionBody: strictObject({
    title: v.optional(v.string({ maxLength: MAX_TEXT_SHORT, allowEmpty: true })),
    description: optionalStringOrNull(MAX_TEXT_LONG),
    order: optionalInt(0, 1_000_000),
  }),

  updateSectionBody: strictObject({
    title: v.optional(v.string({ maxLength: MAX_TEXT_SHORT })),
    description: optionalStringOrNull(MAX_TEXT_LONG),
    order: optionalInt(0, 1_000_000),
  }),

  submitFormBody: strictObject({
    answers: v.optional(
      v.array(answerEntryParser, {
        maxLength: MAX_ANSWERS_PER_SUBMISSION,
      }),
    ),
  }),
};

