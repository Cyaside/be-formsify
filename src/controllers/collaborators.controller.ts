import type { Request, Response } from "express";
import { canManageCollaborators } from "../lib/formAccess";
import prisma from "../lib/prisma";

const DEFAULT_COLLABORATOR_ROLE = "EDITOR" as const;
const EDITABLE_COLLABORATOR_ROLES = new Set(["EDITOR"] as const);

type EditableCollaboratorRole = "EDITOR";
type ResolvedTargetUser =
  | { user: { id: string; email: string; name: string | null } }
  | { error: { status: number; message: string } };

const serializeCollaborator = (collaborator: {
  formId: string;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; email: string; name: string | null };
}) => ({
  formId: collaborator.formId,
  userId: collaborator.userId,
  role: collaborator.role,
  createdAt: collaborator.createdAt,
  updatedAt: collaborator.updatedAt,
  user: collaborator.user,
});

const parseCollaboratorRole = (value: unknown): EditableCollaboratorRole => {
  const role = typeof value === "string" ? value : DEFAULT_COLLABORATOR_ROLE;
  return EDITABLE_COLLABORATOR_ROLES.has(role as EditableCollaboratorRole)
    ? (role as EditableCollaboratorRole)
    : DEFAULT_COLLABORATOR_ROLE;
};

const resolveTargetUser = async (
  body: { userId?: string; email?: string },
): Promise<ResolvedTargetUser> => {
  const hasUserId = typeof body.userId === "string" && body.userId.trim().length > 0;
  const hasEmail = typeof body.email === "string" && body.email.trim().length > 0;

  if ((hasUserId && hasEmail) || (!hasUserId && !hasEmail)) {
    return {
      error: {
        status: 400,
        message: "Provide exactly one of userId or email",
      },
    };
  }

  const user = hasUserId
    ? await prisma.user.findUnique({
        where: { id: body.userId! },
        select: { id: true, email: true, name: true },
      })
    : await prisma.user.findUnique({
        where: { email: body.email! },
        select: { id: true, email: true, name: true },
      });

  if (!user) {
    return {
      error: {
        status: 404,
        message: "User not found",
      },
    };
  }

  return { user };
};

export const listCollaborators = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const access = await canManageCollaborators(req.user!.id, formId);
  if (!access.ok) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  const [owner, collaborators] = await Promise.all([
    prisma.user.findUnique({
      where: { id: access.form.ownerId },
      select: { id: true, email: true, name: true },
    }),
    prisma.formCollaborator.findMany({
      where: { formId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    }),
  ]);

  return res.json({
    owner: owner
      ? {
          userId: owner.id,
          role: "OWNER",
          user: owner,
        }
      : null,
    data: collaborators.map(serializeCollaborator),
  });
};

export const createCollaborator = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const access = await canManageCollaborators(req.user!.id, formId);
  if (!access.ok) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  const target = await resolveTargetUser(req.body as { userId?: string; email?: string });
  if ("error" in target) {
    return res.status(target.error.status).json({ message: target.error.message });
  }

  if (target.user.id === access.form.ownerId) {
    return res.status(400).json({
      message: "Owner is managed via ownerId and cannot be added as collaborator",
    });
  }

  const existing = await prisma.formCollaborator.findUnique({
    where: {
      formId_userId: {
        formId,
        userId: target.user.id,
      },
    },
  });
  if (existing) {
    return res.status(409).json({ message: "Collaborator already exists" });
  }

  const role = parseCollaboratorRole(req.body.role);

  const collaborator = await prisma.formCollaborator.create({
    data: {
      formId,
      userId: target.user.id,
      role,
    },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  return res.status(201).json({ data: serializeCollaborator(collaborator) });
};

export const updateCollaborator = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const targetUserId = String(req.params.userId);
  const access = await canManageCollaborators(req.user!.id, formId);
  if (!access.ok) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  if (targetUserId === access.form.ownerId) {
    return res.status(400).json({ message: "Owner role cannot be changed here" });
  }

  const role = parseCollaboratorRole(req.body.role);

  const existing = await prisma.formCollaborator.findUnique({
    where: {
      formId_userId: {
        formId,
        userId: targetUserId,
      },
    },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });
  if (!existing) {
    return res.status(404).json({ message: "Collaborator not found" });
  }

  const updated = await prisma.formCollaborator.update({
    where: {
      formId_userId: {
        formId,
        userId: targetUserId,
      },
    },
    data: { role },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  return res.json({ data: serializeCollaborator(updated) });
};

export const deleteCollaborator = async (req: Request, res: Response) => {
  const formId = String(req.params.id);
  const targetUserId = String(req.params.userId);
  const access = await canManageCollaborators(req.user!.id, formId);
  if (!access.ok) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  if (targetUserId === access.form.ownerId) {
    return res.status(400).json({ message: "Owner cannot be removed via collaborator endpoint" });
  }

  const existing = await prisma.formCollaborator.findUnique({
    where: {
      formId_userId: {
        formId,
        userId: targetUserId,
      },
    },
  });
  if (!existing) {
    return res.status(404).json({ message: "Collaborator not found" });
  }

  await prisma.formCollaborator.delete({
    where: {
      formId_userId: {
        formId,
        userId: targetUserId,
      },
    },
  });

  return res.status(204).send();
};
