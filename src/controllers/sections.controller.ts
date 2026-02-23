import type { Request, Response } from "express";
import prisma from "../lib/prisma";

const DEFAULT_SECTION_TITLE = "Section 1";

const ensureOwnedForm = async (formId: string, userId: string) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { id: true, ownerId: true },
  });
  if (!form) {
    return { error: { status: 404, message: "Form not found" } };
  }
  if (form.ownerId !== userId) {
    return { error: { status: 403, message: "Forbidden" } };
  }
  return { form };
};

const ensureEditableSection = async (
  section: { id: string; formId: string; form: { ownerId: string } },
  userId: string,
) => {
  if (section.form.ownerId !== userId) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  const answerCount = await prisma.answer.count({
    where: {
      question: {
        sectionId: section.id,
      },
    },
  });
  if (answerCount > 0) {
    return {
      error: {
        status: 409,
        message: "This section already has responses and can no longer be modified.",
      },
    };
  }

  return { ok: true as const };
};

const ensureReadableForm = async (formId: string, userId?: string | null) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { id: true, ownerId: true, isPublished: true },
  });
  if (!form) {
    return { error: { status: 404, message: "Form not found" } };
  }
  const isOwner = userId && form.ownerId === userId;
  if (!form.isPublished && !isOwner) {
    return { error: { status: 404, message: "Form not found" } };
  }
  return { form };
};

export const listSections = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const guard = await ensureReadableForm(formId, req.user?.id ?? null);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  const sections = await prisma.section.findMany({
    where: { formId },
    orderBy: { order: "asc" },
  });

  return res.json({ data: sections });
};

export const createSection = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const guard = await ensureOwnedForm(formId, req.user!.id);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  const title = String(req.body.title ?? "").trim() || DEFAULT_SECTION_TITLE;
  const descriptionRaw = req.body.description;
  const description =
    descriptionRaw === null || descriptionRaw === undefined
      ? null
      : String(descriptionRaw).trim();
  const orderValue = Number(req.body.order);
  const order = Number.isFinite(orderValue)
    ? orderValue
    : await prisma.section.count({ where: { formId } });

  const section = await prisma.section.create({
    data: {
      formId,
      title,
      description,
      order,
    },
  });

  return res.status(201).json({ data: section });
};

export const updateSection = async (req: Request, res: Response) => {
  const sectionId = String(req.params.id);
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { form: true },
  });
  if (!section) {
    return res.status(404).json({ message: "Section not found" });
  }

  const guard = await ensureEditableSection(section, req.user!.id);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  const data: { title?: string; description?: string | null; order?: number } = {};

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
  if (req.body.order !== undefined) {
    const orderValue = Number(req.body.order);
    if (!Number.isFinite(orderValue)) {
      return res.status(400).json({ message: "Invalid order value" });
    }
    data.order = orderValue;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  const updated = await prisma.section.update({
    where: { id: sectionId },
    data,
  });

  return res.json({ data: updated });
};

export const deleteSection = async (req: Request, res: Response) => {
  const sectionId = String(req.params.id);
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { form: true },
  });
  if (!section) {
    return res.status(404).json({ message: "Section not found" });
  }

  const guard = await ensureEditableSection(section, req.user!.id);
  if (guard.error) {
    return res.status(guard.error.status).json({ message: guard.error.message });
  }

  const sectionCount = await prisma.section.count({ where: { formId: section.formId } });
  if (sectionCount <= 1) {
    return res.status(400).json({ message: "A form must have at least one section." });
  }

  const questionCount = await prisma.question.count({ where: { sectionId } });
  if (questionCount > 0) {
    return res.status(409).json({ message: "This section still contains questions." });
  }

  await prisma.section.delete({ where: { id: sectionId } });
  return res.status(204).send();
};
