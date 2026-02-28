import prisma from "../../shared/db/prisma";

export const collaboratorsRepository = {
  findUserById: (userId: string) =>
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    }),

  findUserByEmail: (email: string) =>
    prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    }),

  findOwnerAndCollaborators: (formId: string, ownerId: string) =>
    Promise.all([
      prisma.user.findUnique({
        where: { id: ownerId },
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
    ]),

  findCollaborator: (formId: string, userId: string) =>
    prisma.formCollaborator.findUnique({
      where: {
        formId_userId: {
          formId,
          userId,
        },
      },
    }),

  findCollaboratorWithUser: (formId: string, userId: string) =>
    prisma.formCollaborator.findUnique({
      where: {
        formId_userId: {
          formId,
          userId,
        },
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    }),

  createCollaborator: (formId: string, userId: string, role: "EDITOR") =>
    prisma.formCollaborator.create({
      data: {
        formId,
        userId,
        role,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    }),

  updateCollaboratorRole: (formId: string, userId: string, role: "EDITOR") =>
    prisma.formCollaborator.update({
      where: {
        formId_userId: {
          formId,
          userId,
        },
      },
      data: { role },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    }),

  deleteCollaborator: (formId: string, userId: string) =>
    prisma.formCollaborator.delete({
      where: {
        formId_userId: {
          formId,
          userId,
        },
      },
    }),
};

