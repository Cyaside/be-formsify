import prisma from "../../lib/prisma";
import { canEditForm, canReadForm } from "../../lib/formAccess";
import { broadcastCollabStatus } from "../../realtime/hub";
import {
  BUILDER_DEFAULT_QUESTION_TITLE,
  BUILDER_DEFAULT_SECTION_TITLE,
  isTempBuilderId,
  normalizeBuilderSnapshotInput,
  requiresBuilderOptions,
} from "./builder.policy";
import { loadBuilderSnapshot } from "./builder.repository";
import type { BuilderSnapshotInput, BuilderSnapshotResponseData } from "./builder.types";

export type BuilderConflictCode = "VERSION_CONFLICT" | "RESPONSES_LOCKED";

export class BuilderHttpError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(typeof payload.message === "string" ? payload.message : `HTTP ${status}`);
    this.name = "BuilderHttpError";
    this.status = status;
    this.payload = payload;
  }
}

class BuilderSnapshotConflictError extends Error {
  latestVersion: number;
  reason: BuilderConflictCode;

  constructor(
    message: string,
    latestVersion: number,
    reason: BuilderConflictCode = "VERSION_CONFLICT",
  ) {
    super(message);
    this.name = "BuilderSnapshotConflictError";
    this.latestVersion = latestVersion;
    this.reason = reason;
  }
}

const toBuilderHttpError = (status: number, message: string) =>
  new BuilderHttpError(status, { message });

const parseAndNormalizeSnapshot = (rawSnapshot: unknown) => {
  try {
    return normalizeBuilderSnapshotInput(rawSnapshot as BuilderSnapshotInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid snapshot payload";
    throw toBuilderHttpError(400, message);
  }
};

const parseBaseVersion = (rawBaseVersion: unknown) => {
  const baseVersion = Number(rawBaseVersion);
  if (!Number.isInteger(baseVersion) || baseVersion < 0) {
    throw toBuilderHttpError(400, "Invalid baseVersion");
  }
  return baseVersion;
};

const buildConflictHttpError = async (
  formId: string,
  message: string,
  latestVersion?: number,
  code?: BuilderConflictCode,
) => {
  const latest = await loadBuilderSnapshot(prisma, formId);
  return new BuilderHttpError(409, {
    code: code ?? "VERSION_CONFLICT",
    message,
    latestVersion: latest?.version ?? latestVersion ?? null,
    snapshot: latest?.snapshot ?? null,
  });
};

export const getBuilderSnapshotForUser = async (
  userId: string,
  formId: string,
): Promise<BuilderSnapshotResponseData> => {
  const access = await canReadForm(userId, formId);
  if (!access.ok) {
    throw toBuilderHttpError(access.error.status, access.error.message);
  }

  const data = await loadBuilderSnapshot(prisma, formId);
  if (!data) {
    throw toBuilderHttpError(404, "Form not found");
  }

  return data;
};

export const updateBuilderSnapshotForUser = async ({
  userId,
  formId,
  rawBaseVersion,
  rawSnapshot,
}: {
  userId: string;
  formId: string;
  rawBaseVersion: unknown;
  rawSnapshot: unknown;
}): Promise<BuilderSnapshotResponseData> => {
  const access = await canEditForm(userId, formId);
  if (!access.ok) {
    throw toBuilderHttpError(access.error.status, access.error.message);
  }

  const normalizedSnapshot = parseAndNormalizeSnapshot(rawSnapshot);
  if (!normalizedSnapshot.title) {
    throw toBuilderHttpError(400, "Title is required");
  }
  const baseVersion = parseBaseVersion(rawBaseVersion);

  try {
    const data = await prisma.$transaction(async (tx) => {
      const form = await tx.form.findUnique({
        where: { id: formId },
        select: { id: true, version: true },
      });
      if (!form) {
        throw new Error("FORM_NOT_FOUND");
      }

      if (form.version !== baseVersion) {
        throw new BuilderSnapshotConflictError("Builder snapshot version conflict", form.version);
      }

      const responseCount = await tx.response.count({ where: { formId } });
      if (responseCount > 0) {
        throw new BuilderSnapshotConflictError(
          "Builder snapshot updates are locked once the form has responses",
          form.version,
          "RESPONSES_LOCKED",
        );
      }

      const [existingSections, existingQuestions] = await Promise.all([
        tx.section.findMany({
          where: { formId },
          select: { id: true },
        }),
        tx.question.findMany({
          where: { formId },
          select: { id: true },
        }),
      ]);

      const existingSectionIdSet = new Set(existingSections.map((item) => item.id));
      const existingQuestionIdSet = new Set(existingQuestions.map((item) => item.id));

      await tx.question.deleteMany({ where: { formId } });
      await tx.section.deleteMany({ where: { formId } });

      const sectionIdMap = new Map<string, string>();
      const usedPersistedSectionIds = new Set<string>();

      for (const section of normalizedSnapshot.sections) {
        const preserveId =
          existingSectionIdSet.has(section.id) &&
          !isTempBuilderId(section.id) &&
          !usedPersistedSectionIds.has(section.id);

        const created = await tx.section.create({
          data: {
            ...(preserveId ? { id: section.id } : {}),
            formId,
            title: section.title || BUILDER_DEFAULT_SECTION_TITLE,
            description: section.description,
            order: section.order ?? 0,
          },
          select: { id: true },
        });

        if (preserveId) {
          usedPersistedSectionIds.add(section.id);
        }
        sectionIdMap.set(section.id, created.id);
      }

      const usedPersistedQuestionIds = new Set<string>();

      for (const question of normalizedSnapshot.questions) {
        const resolvedSectionId = sectionIdMap.get(question.sectionId);
        if (!resolvedSectionId) {
          throw new Error(`Question references unresolved section: ${question.sectionId}`);
        }

        const preserveId =
          existingQuestionIdSet.has(question.id) &&
          !isTempBuilderId(question.id) &&
          !usedPersistedQuestionIds.has(question.id);

        await tx.question.create({
          data: {
            ...(preserveId ? { id: question.id } : {}),
            formId,
            sectionId: resolvedSectionId,
            title: question.title || BUILDER_DEFAULT_QUESTION_TITLE,
            description: question.description,
            type: question.type,
            required: question.required,
            order: question.order ?? 0,
            options: requiresBuilderOptions(question.type)
              ? {
                  create: (question.options ?? []).map((label, index) => ({
                    label,
                    order: index,
                  })),
                }
              : undefined,
          },
        });

        if (preserveId) {
          usedPersistedQuestionIds.add(question.id);
        }
      }

      await tx.form.update({
        where: { id: formId },
        data: {
          title: normalizedSnapshot.title,
          description: normalizedSnapshot.description,
          thankYouTitle: normalizedSnapshot.thankYouTitle,
          thankYouMessage: normalizedSnapshot.thankYouMessage,
          isClosed: normalizedSnapshot.isClosed,
          responseLimit: normalizedSnapshot.responseLimit,
          version: { increment: 1 },
        },
      });

      const latest = await loadBuilderSnapshot(tx, formId);
      if (!latest) {
        throw new Error("FORM_NOT_FOUND");
      }
      return latest;
    });

    return data;
  } catch (error) {
    if (error instanceof BuilderHttpError) {
      throw error;
    }

    if (error instanceof BuilderSnapshotConflictError) {
      if (error.reason === "RESPONSES_LOCKED") {
        broadcastCollabStatus({
          formId,
          kind: "RESPONSES_LOCKED",
          message: error.message,
          latestVersion: error.latestVersion,
        });
      }
      throw await buildConflictHttpError(
        formId,
        error.message,
        error.latestVersion,
        error.reason,
      );
    }

    if (error instanceof Error && error.message === "FORM_NOT_FOUND") {
      throw toBuilderHttpError(404, "Form not found");
    }

    if (error instanceof Error) {
      throw toBuilderHttpError(400, error.message);
    }

    throw error;
  }
};

export { loadBuilderSnapshot };
