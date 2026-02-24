import prisma from "./prisma";

type EffectiveFormRole = "OWNER" | "EDITOR" | "VIEWER" | "NONE";

type FormAccessContext = {
  id: string;
  ownerId: string;
  isPublished: boolean;
  version: number;
  role: EffectiveFormRole;
  isOwner: boolean;
};

type FormAccessSuccess = {
  ok: true;
  form: FormAccessContext;
};

type FormAccessFailure = {
  ok: false;
  error: {
    status: number;
    message: string;
  };
};

type FormAccessResult = FormAccessSuccess | FormAccessFailure;

const resolveFormAccess = async (
  userId: string | null | undefined,
  formId: string,
): Promise<FormAccessResult> => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: {
      id: true,
      ownerId: true,
      isPublished: true,
      version: true,
      collaborators: {
        where: { userId: userId ?? "" },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!form) {
    return { ok: false, error: { status: 404, message: "Form not found" } };
  }

  const isOwner = Boolean(userId) && form.ownerId === userId;
  const collaboratorRole = userId ? form.collaborators[0]?.role : undefined;

  const role: EffectiveFormRole = isOwner
    ? "OWNER"
    : collaboratorRole === "EDITOR" || collaboratorRole === "OWNER"
      ? collaboratorRole
      : collaboratorRole === "VIEWER"
        ? "VIEWER"
        : "NONE";

  return {
    ok: true,
    form: {
      id: form.id,
      ownerId: form.ownerId,
      isPublished: form.isPublished,
      version: form.version,
      role,
      isOwner,
    },
  };
};

export const canReadForm = async (
  userId: string | null | undefined,
  formId: string,
): Promise<FormAccessResult> => {
  const access = await resolveFormAccess(userId, formId);
  if (!access.ok) return access;

  const { form } = access;
  if (form.isPublished || form.role !== "NONE") {
    return access;
  }

  return { ok: false, error: { status: 404, message: "Form not found" } };
};

export const canEditForm = async (
  userId: string,
  formId: string,
): Promise<FormAccessResult> => {
  const access = await resolveFormAccess(userId, formId);
  if (!access.ok) return access;

  if (access.form.role === "OWNER" || access.form.role === "EDITOR") {
    return access;
  }

  return { ok: false, error: { status: 403, message: "Forbidden" } };
};

export const canManageCollaborators = async (
  userId: string,
  formId: string,
): Promise<FormAccessResult> => {
  const access = await resolveFormAccess(userId, formId);
  if (!access.ok) return access;

  if (access.form.role === "OWNER") {
    return access;
  }

  return { ok: false, error: { status: 403, message: "Forbidden" } };
};
