import type { Request, Response } from "express";
import type { Prisma } from "../generated/prisma/client";
import prisma from "../lib/prisma";

const DEFAULT_THANK_YOU_TITLE = "Terima kasih!";
const DEFAULT_THANK_YOU_MESSAGE = "Respons kamu sudah terekam.";
const DEFAULT_SECTION_TITLE = "Section 1";
const MAX_RESPONSE_LIMIT = 100_000;

const parseOptionalResponseLimit = (value: unknown) => {
  if (value === undefined) {
    return { provided: false as const, value: undefined as number | null | undefined };
  }
  if (value === null || value === "") {
    return { provided: true as const, value: null };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      provided: true as const,
      error: "responseLimit harus berupa angka bulat positif.",
    };
  }
  if (parsed > MAX_RESPONSE_LIMIT) {
    return {
      provided: true as const,
      error: `responseLimit maksimal ${MAX_RESPONSE_LIMIT}.`,
    };
  }

  return { provided: true as const, value: parsed };
};

export const listForms = async (req: Request, res: Response) => {
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  const status =
    typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "all";
  const sort =
    typeof req.query.sort === "string" ? req.query.sort.trim().toLowerCase() : "newest";

  const where: Prisma.FormWhereInput = { ownerId: req.user!.id };
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

  const forms = await prisma.form.findMany({
    where,
    orderBy,
    include: {
      owner: { select: { id: true, email: true, name: true } },
    },
  });
  return res.json({ data: forms });
};

export const listPublicForms = async (req: Request, res: Response) => {
  const pageValue = Number(req.query.page);
  const limitValue = Number(req.query.limit);
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const limit =
    Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 50) : 9;
  const skip = (page - 1) * limit;

  const [total, forms] = await Promise.all([
    prisma.form.count({ where: { isPublished: true } }),
    prisma.form.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        owner: { select: { id: true, email: true, name: true } },
      },
    }),
  ]);

  return res.json({
    data: forms,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
};

export const getForm = async (req: Request, res: Response) => {
  const form = await prisma.form.findUnique({
    where: { id: String(req.params.id) },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      _count: { select: { responses: true } },
    },
  });
  if (!form) {
    return res.status(404).json({ message: "Form not found" });
  }

  const isOwner = req.user?.id === form.ownerId;
  if (!form.isPublished && !isOwner) {
    return res.status(404).json({ message: "Form not found" });
  }

  return res.json({
    data: {
      ...form,
      responseCount: form._count.responses,
    },
  });
};

export const createForm = async (req: Request, res: Response) => {
  const title = String(req.body.title ?? "").trim();
  const descriptionRaw = req.body.description;
  const thankYouTitleRaw = req.body.thankYouTitle;
  const thankYouMessageRaw = req.body.thankYouMessage;
  const description =
    descriptionRaw === null || descriptionRaw === undefined
      ? null
      : String(descriptionRaw).trim();
  const thankYouTitle =
    typeof thankYouTitleRaw === "string" && thankYouTitleRaw.trim().length > 0
      ? thankYouTitleRaw.trim()
      : DEFAULT_THANK_YOU_TITLE;
  const thankYouMessage =
    typeof thankYouMessageRaw === "string" && thankYouMessageRaw.trim().length > 0
      ? thankYouMessageRaw.trim()
      : DEFAULT_THANK_YOU_MESSAGE;
  const responseLimitResult = parseOptionalResponseLimit(req.body.responseLimit);
  if ("error" in responseLimitResult) {
    return res.status(400).json({ message: responseLimitResult.error });
  }
  const isClosed = req.body.isClosed === undefined ? false : Boolean(req.body.isClosed);

  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }

  const form = await prisma.$transaction(async (tx) => {
    const created = await tx.form.create({
      data: {
        title,
        description,
        thankYouTitle,
        thankYouMessage,
        isPublished: false,
        isClosed,
        responseLimit: responseLimitResult.provided ? responseLimitResult.value : null,
        ownerId: req.user!.id,
      },
      include: { owner: { select: { id: true, email: true, name: true } } },
    });

    await tx.section.create({
      data: {
        formId: created.id,
        title: DEFAULT_SECTION_TITLE,
        order: 0,
      },
    });

    return created;
  });

  return res.status(201).json({ data: form });
};

export const updateForm = async (req: Request, res: Response) => {
  const form = await prisma.form.findUnique({ where: { id: String(req.params.id) } });
  if (!form) {
    return res.status(404).json({ message: "Form not found" });
  }
  if (form.ownerId !== req.user!.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const data: {
    title?: string;
    description?: string | null;
    thankYouTitle?: string;
    thankYouMessage?: string;
    isPublished?: boolean;
    isClosed?: boolean;
    responseLimit?: number | null;
  } = {};
  if (req.body.title !== undefined) {
    const title = String(req.body.title ?? "").trim();
    if (!title) {
      return res.status(400).json({ message: "Title cannot be empty" });
    }
    data.title = title;
  }
  if (req.body.description !== undefined) {
    data.description =
      req.body.description === null ? null : String(req.body.description).trim();
  }
  if (req.body.thankYouTitle !== undefined) {
    const thankYouTitle = String(req.body.thankYouTitle ?? "").trim();
    data.thankYouTitle = thankYouTitle || DEFAULT_THANK_YOU_TITLE;
  }
  if (req.body.thankYouMessage !== undefined) {
    const thankYouMessage = String(req.body.thankYouMessage ?? "").trim();
    data.thankYouMessage = thankYouMessage || DEFAULT_THANK_YOU_MESSAGE;
  }
  if (req.body.isPublished !== undefined) {
    data.isPublished = Boolean(req.body.isPublished);
  }
  if (req.body.isClosed !== undefined) {
    data.isClosed = Boolean(req.body.isClosed);
  }
  const responseLimitResult = parseOptionalResponseLimit(req.body.responseLimit);
  if ("error" in responseLimitResult) {
    return res.status(400).json({ message: responseLimitResult.error });
  }
  if (responseLimitResult.provided) {
    data.responseLimit = responseLimitResult.value;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  if (data.isPublished === true) {
    const questionCount = await prisma.question.count({
      where: { formId: form.id },
    });
    if (questionCount <= 0) {
      return res.status(400).json({
        message: "Form harus memiliki minimal satu pertanyaan sebelum dipublish.",
      });
    }
  }

  const updated = await prisma.form.update({
    where: { id: String(req.params.id) },
    data,
    include: { owner: { select: { id: true, email: true, name: true } } },
  });

  return res.json({ data: updated });
};

export const deleteForm = async (req: Request, res: Response) => {
  const form = await prisma.form.findUnique({ where: { id: String(req.params.id) } });
  if (!form) {
    return res.status(404).json({ message: "Form not found" });
  }
  if (form.ownerId !== req.user!.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await prisma.form.delete({ where: { id: String(req.params.id) } });
  return res.status(204).send();
};
