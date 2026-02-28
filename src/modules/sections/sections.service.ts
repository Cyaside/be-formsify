import { canEditForm, canReadForm } from "../../shared/access/formAccess";
import { httpError } from "../../shared/errors/httpError";
import { sectionsRepository } from "./sections.repository";

const DEFAULT_SECTION_TITLE = "Section 1";

const ensureEditableSection = async (
  section: { id: string; formId: string },
  userId: string,
) => {
  const access = await canEditForm(userId, section.formId);
  if (!access.ok) throw httpError(access.error.status, access.error.message);

  const answerCount = await sectionsRepository.countAnswersBySection(section.id);
  if (answerCount > 0) {
    throw httpError(
      409,
      "This section already has responses and can no longer be modified.",
    );
  }
};

export const listSectionsForForm = async ({
  formId,
  userId,
}: {
  formId: string;
  userId: string | null | undefined;
}) => {
  const guard = await canReadForm(userId ?? null, formId);
  if (!guard.ok) throw httpError(guard.error.status, guard.error.message);

  const sections = await sectionsRepository.listByForm(formId);
  return { data: sections };
};

export const createSectionForForm = async ({
  formId,
  userId,
  body,
}: {
  formId: string;
  userId: string;
  body: { title?: unknown; description?: unknown; order?: unknown };
}) => {
  const guard = await canEditForm(userId, formId);
  if (!guard.ok) throw httpError(guard.error.status, guard.error.message);

  const title = String(body.title ?? "").trim() || DEFAULT_SECTION_TITLE;
  const descriptionRaw = body.description;
  const description =
    descriptionRaw === null || descriptionRaw === undefined
      ? null
      : String(descriptionRaw).trim();
  const orderValue = Number(body.order);
  const order = Number.isFinite(orderValue)
    ? orderValue
    : await sectionsRepository.countByForm(formId);

  const section = await sectionsRepository.create({ formId, title, description, order });
  return { data: section };
};

export const updateSectionByIdForUser = async ({
  sectionId,
  userId,
  body,
}: {
  sectionId: string;
  userId: string;
  body: { title?: unknown; description?: unknown; order?: unknown };
}) => {
  const section = await sectionsRepository.findRef(sectionId);
  if (!section) throw httpError(404, "Section not found");

  await ensureEditableSection(section, userId);

  const data: { title?: string; description?: string | null; order?: number } = {};
  if (body.title !== undefined) {
    const title = String(body.title ?? "").trim();
    if (!title) throw httpError(400, "Title cannot be empty");
    data.title = title;
  }
  if (body.description !== undefined) {
    data.description = body.description === null ? null : String(body.description).trim();
  }
  if (body.order !== undefined) {
    const orderValue = Number(body.order);
    if (!Number.isFinite(orderValue)) {
      throw httpError(400, "Invalid order value");
    }
    data.order = orderValue;
  }

  if (Object.keys(data).length === 0) {
    throw httpError(400, "No fields to update");
  }

  const updated = await sectionsRepository.update(sectionId, data);
  return { data: updated };
};

export const deleteSectionByIdForUser = async ({
  sectionId,
  userId,
}: {
  sectionId: string;
  userId: string;
}) => {
  const section = await sectionsRepository.findRef(sectionId);
  if (!section) throw httpError(404, "Section not found");

  await ensureEditableSection(section, userId);

  const sectionCount = await sectionsRepository.countByForm(section.formId);
  if (sectionCount <= 1) {
    throw httpError(400, "A form must have at least one section.");
  }

  const questionCount = await sectionsRepository.countQuestionsBySection(sectionId);
  if (questionCount > 0) {
    throw httpError(409, "This section still contains questions.");
  }

  await sectionsRepository.delete(sectionId);
};

