import prisma from "../../lib/prisma";

export const authRepository = {
  findUserByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

  createLocalUser: (params: { email: string; passwordHash: string; name: string | null }) =>
    prisma.user.create({
      data: {
        email: params.email,
        passwordHash: params.passwordHash,
        name: params.name,
        provider: "LOCAL",
      },
      select: {
        id: true,
        email: true,
        name: true,
        provider: true,
        createdAt: true,
      },
    }),

  findUserByGoogleId: (googleId: string) => prisma.user.findUnique({ where: { googleId } }),

  updateUserGoogleLink: (params: { id: string; googleId: string }) =>
    prisma.user.update({
      where: { id: params.id },
      data: { googleId: params.googleId, provider: "GOOGLE" },
    }),

  createGoogleUser: (params: { email: string; name: string | null; googleId: string }) =>
    prisma.user.create({
      data: {
        email: params.email,
        name: params.name,
        provider: "GOOGLE",
        googleId: params.googleId,
      },
    }),

  findMeById: (userId: string) =>
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, provider: true, createdAt: true },
    }),
};
