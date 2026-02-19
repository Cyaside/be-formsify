import type { Request, Response } from "express";
import prisma from "../lib/prisma";

export const listForms = async (req: Request, res: Response) => {
  const forms = await prisma.form.findMany({
    where: { ownerId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, email: true, name: true } },
    },
  });
  return res.json({ data: forms });
};

export const listPublicForms = async (_req: Request, res: Response) => {
  const forms = await prisma.form.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, email: true, name: true } },
    },
  });
  return res.json({ data: forms });
};

export const getForm = async (req: Request, res: Response) => {
  const form = await prisma.form.findUnique({
    where: { id: String(req.params.id) },
    include: { owner: { select: { id: true, email: true, name: true } } },
  });
  if (!form) {
    return res.status(404).json({ message: "Form not found" });
  }
  return res.json({ data: form });
};

export const createForm = async (req: Request, res: Response) => {
  const title = String(req.body.title ?? "").trim();
  const descriptionRaw = req.body.description;
  const description =
    descriptionRaw === null || descriptionRaw === undefined
      ? null
      : String(descriptionRaw).trim();

  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }

  const form = await prisma.form.create({
    data: {
      title,
      description,
      ownerId: req.user!.id,
    },
    include: { owner: { select: { id: true, email: true, name: true } } },
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

  const data: { title?: string; description?: string | null } = {};
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

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
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
