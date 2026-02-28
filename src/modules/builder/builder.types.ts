export type BuilderSnapshotQuestionType =
  | "SHORT_ANSWER"
  | "PARAGRAPH"
  | "MCQ"
  | "CHECKBOX"
  | "DROPDOWN";

export type BuilderSnapshotSectionInput = {
  id: string;
  title: string;
  description: string | null;
  order?: number;
};

export type BuilderSnapshotQuestionInput = {
  id: string;
  sectionId: string;
  title: string;
  description: string | null;
  type: BuilderSnapshotQuestionType;
  required: boolean;
  order?: number;
  options?: string[];
};

export type BuilderSnapshotInput = {
  title: string;
  description: string | null;
  thankYouTitle: string;
  thankYouMessage: string;
  isClosed: boolean;
  responseLimit: number | null;
  sections: BuilderSnapshotSectionInput[];
  questions: BuilderSnapshotQuestionInput[];
};

export type BuilderSnapshotResponseData = {
  formId: string;
  version: number;
  snapshot: {
    title: string;
    description: string | null;
    thankYouTitle: string;
    thankYouMessage: string;
    isClosed: boolean;
    responseLimit: number | null;
    sections: Array<{
      id: string;
      title: string;
      description: string | null;
      order: number;
    }>;
    questions: Array<{
      id: string;
      sectionId: string;
      title: string;
      description: string | null;
      type: BuilderSnapshotQuestionType;
      required: boolean;
      order: number;
      options: string[];
    }>;
  };
};
