import { canManageCollaborators } from "../../shared/access/formAccess";
import { httpError } from "../../shared/errors/httpError";
import { collaboratorsRepository } from "./collaborators.repository";

const DEFAULT_COLLABORATOR_ROLE = "EDITOR" as const;
const EDITABLE_COLLABORATOR_ROLES = new Set(["EDITOR"] as const);

type EditableCollaboratorRole = "EDITOR";

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

const ensureCanManageCollaborators = async (userId: string, formId: string) => {
  const access = await canManageCollaborators(userId, formId);
  if (!access.ok) {
    throw httpError(access.error.status, access.error.message);
  }
  return access.form;
};

const resolveTargetUser = async (body: { userId?: string; email?: string }) => {
  const hasUserId = typeof body.userId === "string" && body.userId.trim().length > 0;
  const hasEmail = typeof body.email === "string" && body.email.trim().length > 0;

  if ((hasUserId && hasEmail) || (!hasUserId && !hasEmail)) {
    throw httpError(400, "Provide exactly one of userId or email");
  }

  const user = hasUserId
    ? await collaboratorsRepository.findUserById(body.userId!)
    : await collaboratorsRepository.findUserByEmail(body.email!);

  if (!user) {
    throw httpError(404, "User not found");
  }

  return user;
};

export const listCollaboratorsForForm = async ({
  userId,
  formId,
}: {
  userId: string;
  formId: string;
}) => {
  const accessForm = await ensureCanManageCollaborators(userId, formId);
  const [owner, collaborators] = await collaboratorsRepository.findOwnerAndCollaborators(
    formId,
    accessForm.ownerId,
  );

  return {
    owner: owner
      ? {
          userId: owner.id,
          role: "OWNER" as const,
          user: owner,
        }
      : null,
    data: collaborators.map(serializeCollaborator),
  };
};

export const createCollaboratorForForm = async ({
  userId,
  formId,
  body,
}: {
  userId: string;
  formId: string;
  body: { userId?: string; email?: string; role?: unknown };
}) => {
  const accessForm = await ensureCanManageCollaborators(userId, formId);
  const targetUser = await resolveTargetUser(body);

  if (targetUser.id === accessForm.ownerId) {
    throw httpError(400, "Owner is managed via ownerId and cannot be added as collaborator");
  }

  const existing = await collaboratorsRepository.findCollaborator(formId, targetUser.id);
  if (existing) {
    throw httpError(409, "Collaborator already exists");
  }

  const role = parseCollaboratorRole(body.role);
  const collaborator = await collaboratorsRepository.createCollaborator(formId, targetUser.id, role);
  return { data: serializeCollaborator(collaborator) };
};

export const updateCollaboratorForForm = async ({
  userId,
  formId,
  targetUserId,
  body,
}: {
  userId: string;
  formId: string;
  targetUserId: string;
  body: { role?: unknown };
}) => {
  const accessForm = await ensureCanManageCollaborators(userId, formId);
  if (targetUserId === accessForm.ownerId) {
    throw httpError(400, "Owner role cannot be changed here");
  }

  const role = parseCollaboratorRole(body.role);
  const existing = await collaboratorsRepository.findCollaboratorWithUser(formId, targetUserId);
  if (!existing) {
    throw httpError(404, "Collaborator not found");
  }

  const updated = await collaboratorsRepository.updateCollaboratorRole(formId, targetUserId, role);
  return { data: serializeCollaborator(updated) };
};

export const deleteCollaboratorForForm = async ({
  userId,
  formId,
  targetUserId,
}: {
  userId: string;
  formId: string;
  targetUserId: string;
}) => {
  const accessForm = await ensureCanManageCollaborators(userId, formId);
  if (targetUserId === accessForm.ownerId) {
    throw httpError(400, "Owner cannot be removed via collaborator endpoint");
  }

  const existing = await collaboratorsRepository.findCollaborator(formId, targetUserId);
  if (!existing) {
    throw httpError(404, "Collaborator not found");
  }

  await collaboratorsRepository.deleteCollaborator(formId, targetUserId);
};

