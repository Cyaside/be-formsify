import type { Prisma } from "../../generated/prisma/client";
import { canEditForm, canManageCollaborators, canReadForm } from "../../shared/access/formAccess";
import { httpError } from "../../shared/errors/httpError";
import {
  FORMS_DEFAULT_SECTION_TITLE,
  FORMS_DEFAULT_THANK_YOU_MESSAGE,
  FORMS_DEFAULT_THANK_YOU_TITLE,
  parseOptionalResponseLimit,
} from "./forms.policy";
import { formsPrisma, formsRepository } from "./forms.repository";

export const listOwnedFormsForUser = async ({
  userId,
  query,
}: {
  userId: string;
  query: { search?: unknown; status?: unknown; sort?: unknown };
}) => {
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const status = typeof query.status === "string" ? query.status.trim().toLowerCase() : "all";
  const sort = typeof query.sort === "string" ? query.sort.trim().toLowerCase() : "newest";

  const where: Prisma.FormWhereInput = { ownerId: userId };
  if (status === "published") {
    where.isPublished = true;
  } else if (status === "draft") {
    where.isPublished = false;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.FormOrderByWithRelationInput = {
    updatedAt: sort === "oldest" ? "asc" : "desc",
  };

  const forms = await formsRepository.listForms({ where, orderBy });
  return { data: forms };
};

export const listCollaboratorFormsForUser = async ({
  userId,
  query,
}: {
  userId: string;
  query: { search?: unknown; status?: unknown; sort?: unknown };
}) => {
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const status = typeof query.status === "string" ? query.status.trim().toLowerCase() : "all";
  const sort = typeof query.sort === "string" ? query.sort.trim().toLowerCase() : "newest";

  const where: Prisma.FormWhereInput = {
    ownerId: { not: userId },
    collaborators: {
      some: {
        userId,
        role: "EDITOR",
      },
    },
  };

  if (status === "published") {
    where.isPublished = true;
  } else if (status === "draft") {
    where.isPublished = false;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { owner: { email: { contains: search, mode: "insensitive" } } },
      { owner: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.FormOrderByWithRelationInput = {
    updatedAt: sort === "oldest" ? "asc" : "desc",
  };

  const forms = await formsRepository.listForms({ where, orderBy });
  return { data: forms };
};

export const listPublicForms = async (query: { page?: unknown; limit?: unknown }) => {
  const pageValue = Number(query.page);
  const limitValue = Number(query.limit);
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 50) : 9;
  const skip = (page - 1) * limit;

  const [total, forms] = await Promise.all([
    formsRepository.countPublicForms(),
    formsRepository.listPublicForms({ skip, take: limit }),
  ]);

  return {
    data: forms,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const getFormForUser = async ({
  formId,
  userId,
}: {
  formId: string;
  userId: string | null | undefined;
}) => {
  const access = await canReadForm(userId ?? null, formId);
  if (!access.ok) throw httpError(access.error.status, access.error.message);

  const form = await formsRepository.findFormDetailWithOwnerAndCount(formId);
  if (!form) throw httpError(404, "Form not found");

  return {
    data: {
      ...form,
      responseCount: form._count.responses,
    },
  };
};

export const createFormForUser = async ({
  userId,
  body,
}: {
  userId: string;
  body: Record<string, unknown>;
}) => {
  const title = String(body.title ?? "").trim();
  const descriptionRaw = body.description;
  const thankYouTitleRaw = body.thankYouTitle;
  const thankYouMessageRaw = body.thankYouMessage;
  const description =
    descriptionRaw === null || descriptionRaw === undefined
      ? null
      : String(descriptionRaw).trim();
  const thankYouTitle =
    typeof thankYouTitleRaw === "string" && thankYouTitleRaw.trim().length > 0
      ? thankYouTitleRaw.trim()
      : FORMS_DEFAULT_THANK_YOU_TITLE;
  const thankYouMessage =
    typeof thankYouMessageRaw === "string" && thankYouMessageRaw.trim().length > 0
      ? thankYouMessageRaw.trim()
      : FORMS_DEFAULT_THANK_YOU_MESSAGE;
  const responseLimitResult = parseOptionalResponseLimit(body.responseLimit);
  if ("error" in responseLimitResult && typeof responseLimitResult.error === "string") {
    throw httpError(400, responseLimitResult.error);
  }
  const isClosed = body.isClosed === undefined ? false : Boolean(body.isClosed);

  if (!title) {
    throw httpError(400, "Title is required");
  }

  const form = await formsPrisma.$transaction(async (tx) => {
    const created = await tx.form.create({
      data: {
        title,
        description,
        thankYouTitle,
        thankYouMessage,
        isPublished: false,
        isClosed,
        responseLimit: responseLimitResult.provided ? responseLimitResult.value : null,
        ownerId: userId,
      },
      include: { owner: { select: { id: true, email: true, name: true } } },
    });

    await tx.section.create({
      data: {
        formId: created.id,
        title: FORMS_DEFAULT_SECTION_TITLE,
        order: 0,
      },
    });

    return created;
  });

  return { data: form };
};

export const updateFormForUser = async ({
  formId,
  userId,
  body,
}: {
  formId: string;
  userId: string;
  body: Record<string, unknown>;
}) => {
  const access = await canEditForm(userId, formId);
  if (!access.ok) throw httpError(access.error.status, access.error.message);

  const form = await formsRepository.findFormRef(formId);
  if (!form) throw httpError(404, "Form not found");

  const data: {
    title?: string;
    description?: string | null;
    thankYouTitle?: string;
    thankYouMessage?: string;
    isPublished?: boolean;
    isClosed?: boolean;
    responseLimit?: number | null;
  } = {};
  if (body.title !== undefined) {
    const title = String(body.title ?? "").trim();
    if (!title) throw httpError(400, "Title cannot be empty");
    data.title = title;
  }
  if (body.description !== undefined) {
    data.description = body.description === null ? null : String(body.description).trim();
  }
  if (body.thankYouTitle !== undefined) {
    const thankYouTitle = String(body.thankYouTitle ?? "").trim();
    data.thankYouTitle = thankYouTitle || FORMS_DEFAULT_THANK_YOU_TITLE;
  }
  if (body.thankYouMessage !== undefined) {
    const thankYouMessage = String(body.thankYouMessage ?? "").trim();
    data.thankYouMessage = thankYouMessage || FORMS_DEFAULT_THANK_YOU_MESSAGE;
  }
  if (body.isPublished !== undefined) {
    data.isPublished = Boolean(body.isPublished);
  }
  if (body.isClosed !== undefined) {
    data.isClosed = Boolean(body.isClosed);
  }

  const responseLimitResult = parseOptionalResponseLimit(body.responseLimit);
  if ("error" in responseLimitResult && typeof responseLimitResult.error === "string") {
    throw httpError(400, responseLimitResult.error);
  }
  if (responseLimitResult.provided) {
    if (typeof responseLimitResult.value === "number") {
      const currentResponseCount = await formsRepository.countResponsesByForm(form.id);
      if (responseLimitResult.value < currentResponseCount) {
        throw httpError(
          400,
          `responseLimit cannot be less than current responses (${currentResponseCount}).`,
        );
      }
    }
    data.responseLimit = responseLimitResult.value;
  }

  if (Object.keys(data).length === 0) {
    throw httpError(400, "No fields to update");
  }

  if (data.isPublished === true) {
    const questionCount = await formsRepository.countQuestionsByForm(form.id);
    if (questionCount <= 0) {
      throw httpError(400, "A form must have at least one question before publishing.");
    }
  }

  const updated = await formsRepository.updateForm(formId, data);
  return { data: updated };
};

export const deleteFormForUser = async ({
  formId,
  userId,
}: {
  formId: string;
  userId: string;
}) => {
  const access = await canManageCollaborators(userId, formId);
  if (!access.ok) throw httpError(access.error.status, access.error.message);

  const form = await formsRepository.findFormRef(formId);
  if (!form) throw httpError(404, "Form not found");

  await formsRepository.deleteForm(formId);
};

