import type {
  BuilderSnapshotInput,
  BuilderSnapshotQuestionInput,
} from "./builder.types";

export const BUILDER_DEFAULT_THANK_YOU_TITLE = "Thank you!";
export const BUILDER_DEFAULT_THANK_YOU_MESSAGE = "Your response has been recorded.";
export const BUILDER_DEFAULT_SECTION_TITLE = "Section 1";
export const BUILDER_DEFAULT_QUESTION_TITLE = "Untitled Question";

export const requiresBuilderOptions = (type: BuilderSnapshotQuestionInput["type"]) =>
  type === "MCQ" || type === "CHECKBOX" || type === "DROPDOWN";

export const isTempBuilderId = (value: string) => value.startsWith("temp_");

export const normalizeBuilderSnapshotInput = (
  input: BuilderSnapshotInput,
): BuilderSnapshotInput => {
  const sectionDuplicateCheck = new Set<string>();
  const sortedSections = [...input.sections]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((section, index) => {
      if (sectionDuplicateCheck.has(section.id)) {
        throw new Error(`Duplicate section id: ${section.id}`);
      }
      sectionDuplicateCheck.add(section.id);
      return {
        ...section,
        title: section.title.trim() || `Section ${index + 1}`,
        description: section.description?.trim() || null,
        order: index,
      };
    });

  if (sortedSections.length === 0) {
    throw new Error("Snapshot must contain at least one section");
  }

  const sectionIdSet = new Set(sortedSections.map((section) => section.id));
  const sectionOrderMap = new Map(sortedSections.map((section) => [section.id, section.order]));
  const questionDuplicateCheck = new Set<string>();
  const perSectionOrderCounter = new Map<string, number>();

  const sortedQuestions = [...input.questions]
    .sort((a, b) => {
      const sectionOrderA = sectionOrderMap.get(a.sectionId) ?? 0;
      const sectionOrderB = sectionOrderMap.get(b.sectionId) ?? 0;
      if (sectionOrderA !== sectionOrderB) return sectionOrderA - sectionOrderB;
      return (a.order ?? 0) - (b.order ?? 0);
    })
    .map((question) => {
      if (questionDuplicateCheck.has(question.id)) {
        throw new Error(`Duplicate question id: ${question.id}`);
      }
      questionDuplicateCheck.add(question.id);

      if (!sectionIdSet.has(question.sectionId)) {
        throw new Error(`Question references unknown section: ${question.sectionId}`);
      }

      const nextOrder = perSectionOrderCounter.get(question.sectionId) ?? 0;
      perSectionOrderCounter.set(question.sectionId, nextOrder + 1);

      const normalizedOptions = requiresBuilderOptions(question.type)
        ? (question.options ?? [])
            .map((option) => option.trim())
            .filter((option) => option.length > 0)
        : [];

      return {
        ...question,
        title: question.title.trim() || BUILDER_DEFAULT_QUESTION_TITLE,
        description: question.description?.trim() || null,
        order: nextOrder,
        options:
          requiresBuilderOptions(question.type) && normalizedOptions.length === 0
            ? ["Option 1"]
            : normalizedOptions,
      };
    });

  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    thankYouTitle: input.thankYouTitle.trim() || BUILDER_DEFAULT_THANK_YOU_TITLE,
    thankYouMessage: input.thankYouMessage.trim() || BUILDER_DEFAULT_THANK_YOU_MESSAGE,
    isClosed: Boolean(input.isClosed),
    responseLimit: input.responseLimit ?? null,
    sections: sortedSections,
    questions: sortedQuestions,
  };
};
