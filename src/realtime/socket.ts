import type { Server as HttpServer } from "node:http";
import {
  Server as SocketIOServer,
  type Socket,
  type Server,
} from "socket.io";
import { AUTH_COOKIE_NAME, getTokenFromAuthHeader, verifyToken } from "../lib/auth";
import { isFormCollabEnabled } from "../lib/config";
import { loadBuilderSnapshot } from "../controllers/builderSnapshot.controller";
import { canEditForm, canReadForm } from "../lib/formAccess";
import prisma from "../lib/prisma";
import {
  COLLAB_EVENTS,
  type CollabClientToServerEvents,
  type CollabEditingTarget,
  type CollabErrorServerPayload,
  type CollabInterServerEvents,
  type CollabJoinClientPayload,
  type CollabJoinAck,
  type CollabLeaveClientPayload,
  type CollabOpClientPayload,
  type CollabParticipant,
  type CollabPresenceUpdateClientPayload,
  type CollabServerToClientEvents,
  type CollabSocketData,
  type CollabSyncRequestClientPayload,
} from "./events";

type SocketUser = NonNullable<CollabSocketData["user"]>;
type CollabIo = Server<
  CollabClientToServerEvents,
  CollabServerToClientEvents,
  CollabInterServerEvents,
  CollabSocketData
>;
type CollabSocket = Socket<
  CollabClientToServerEvents,
  CollabServerToClientEvents,
  CollabInterServerEvents,
  CollabSocketData
>;

const FORM_ROOM_PREFIX = "form:";

const roomPresence = new Map<string, Map<string, CollabParticipant>>();

const unwrapEnvString = (value?: string) => {
  if (!value) return value;
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const parseCookieHeader = (cookieHeader?: string) => {
  if (!cookieHeader) return new Map<string, string>();
  const entries = cookieHeader.split(";").map((part) => part.trim());
  const cookies = new Map<string, string>();

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!key) continue;
    cookies.set(key, decodeURIComponent(value));
  }

  return cookies;
};

const getSocketToken = (socket: CollabSocket) => {
  const authHeader =
    typeof socket.handshake.headers.authorization === "string"
      ? socket.handshake.headers.authorization
      : null;
  const headerToken = getTokenFromAuthHeader(authHeader);
  if (headerToken) return headerToken;

  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  const cookieToken = cookies.get(AUTH_COOKIE_NAME);
  if (cookieToken) return cookieToken;

  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.trim().length > 0) {
    return authToken.trim();
  }

  return null;
};

const getSocketCorsOrigins = () => {
  const defaultOrigin = "http://localhost:3000";
  return (process.env.CORS_ORIGIN ?? defaultOrigin)
    .split(",")
    .map((origin) => unwrapEnvString(origin)?.replace(/\/+$/, "") ?? "")
    .filter((origin) => origin.length > 0);
};

const formRoomName = (formId: string) => `${FORM_ROOM_PREFIX}${formId}`;

const parseFormIdPayload = (value: unknown): { formId: string } | null => {
  if (typeof value !== "object" || value === null) return null;
  const formId = "formId" in value && typeof value.formId === "string"
    ? value.formId.trim()
    : "";
  if (!formId) return null;
  return { formId };
};

const parseJoinPayload = (value: unknown): CollabJoinClientPayload | null => {
  const parsed = parseFormIdPayload(value);
  return parsed ? { formId: parsed.formId } : null;
};

const parseLeavePayload = (value: unknown): CollabLeaveClientPayload | null => {
  const parsed = parseFormIdPayload(value);
  return parsed ? { formId: parsed.formId } : null;
};

const isValidEditingTarget = (value: unknown): value is CollabEditingTarget => {
  if (value === null) return true;
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  if (
    kind !== "form" &&
    kind !== "section" &&
    kind !== "question" &&
    kind !== "option"
  ) {
    return false;
  }
  if (candidate.id !== undefined && typeof candidate.id !== "string") return false;
  if (candidate.field !== undefined && typeof candidate.field !== "string") return false;
  return true;
};

const parsePresenceUpdatePayload = (
  value: unknown,
): CollabPresenceUpdateClientPayload | null => {
  if (typeof value !== "object" || value === null) return null;
  const formId = "formId" in value && typeof value.formId === "string"
    ? value.formId.trim()
    : "";
  if (!formId) return null;
  const editingTarget = "editingTarget" in value ? value.editingTarget : null;
  if (!isValidEditingTarget(editingTarget)) return null;
  return { formId, editingTarget };
};

const parseSyncRequestPayload = (value: unknown): CollabSyncRequestClientPayload | null => {
  const parsed = parseFormIdPayload(value);
  return parsed ? { formId: parsed.formId } : null;
};

const parseOpPayload = (value: unknown): CollabOpClientPayload | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const formId = typeof candidate.formId === "string" ? candidate.formId.trim() : "";
  const opId = typeof candidate.opId === "string" ? candidate.opId.trim() : "";
  const type = typeof candidate.type === "string" ? candidate.type.trim() : "";
  const baseVersion = candidate.baseVersion;

  if (!formId || !opId || !type) return null;
  if (!Number.isInteger(baseVersion) || (baseVersion as number) < 0) return null;

  return {
    formId,
    opId,
    baseVersion: baseVersion as number,
    type,
    payload: candidate.payload,
  };
};

const getParticipants = (formId: string) =>
  Array.from(roomPresence.get(formId)?.values() ?? []).sort((a, b) =>
    a.joinedAt.localeCompare(b.joinedAt),
  );

const upsertParticipant = ({
  formId,
  socketId,
  user,
  role,
  editingTarget,
}: {
  formId: string;
  socketId: string;
  user: SocketUser;
  role: CollabParticipant["role"];
  editingTarget: CollabEditingTarget;
}) => {
  const bySocket = roomPresence.get(formId) ?? new Map<string, CollabParticipant>();
  const existing = bySocket.get(socketId);
  const now = new Date().toISOString();
  bySocket.set(socketId, {
    socketId,
    user: { id: user.id, email: user.email },
    role,
    editingTarget,
    joinedAt: existing?.joinedAt ?? now,
    lastSeenAt: now,
  });
  roomPresence.set(formId, bySocket);
};

const removeParticipant = (formId: string, socketId: string) => {
  const bySocket = roomPresence.get(formId);
  if (!bySocket) return;
  bySocket.delete(socketId);
  if (bySocket.size === 0) {
    roomPresence.delete(formId);
    return;
  }
  roomPresence.set(formId, bySocket);
};

const emitPresence = (io: CollabIo, formId: string) => {
  io.to(formRoomName(formId)).emit(COLLAB_EVENTS.presence, {
    formId,
    participants: getParticipants(formId),
  });
};

const emitSocketError = (
  socket: CollabSocket,
  payload: CollabErrorServerPayload,
) => {
  socket.emit(COLLAB_EVENTS.error, payload);
};

const emitAuthErrorAndDisconnect = (socket: CollabSocket, message: string) => {
  emitSocketError(socket, { message, code: "UNAUTHORIZED" });
  socket.disconnect(true);
};

const getJoinedFormIds = (socket: CollabSocket) =>
  Array.from(socket.rooms)
    .filter((room) => room.startsWith(FORM_ROOM_PREFIX))
    .map((room) => room.slice(FORM_ROOM_PREFIX.length));

export const setupRealtimeServer = (httpServer: HttpServer) => {
  if (!isFormCollabEnabled()) {
    return null;
  }

  const io: CollabIo = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: getSocketCorsOrigins(),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = getSocketToken(socket);
      if (!token) {
        return next(new Error("Missing authentication token"));
      }

      const decoded = verifyToken(token);
      if (!decoded.sub || typeof decoded.sub !== "string") {
        return next(new Error("Invalid token payload"));
      }

      socket.data.user = {
        id: decoded.sub,
        email: String(decoded.email ?? ""),
      };

      return next();
    } catch {
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    if (!user) {
      emitAuthErrorAndDisconnect(socket, "Unauthorized");
      return;
    }

    socket.emit(COLLAB_EVENTS.ready, {
      user: { id: user.id, email: user.email },
    });

    socket.on(COLLAB_EVENTS.join, async (rawPayload, ack) => {
      const payload = parseJoinPayload(rawPayload);
      if (!payload) {
        const response: CollabJoinAck = { ok: false, status: 400, message: "Invalid formId" };
        ack?.(response);
        emitSocketError(socket, { message: "Invalid join payload", code: "INVALID_PAYLOAD" });
        return;
      }

      const access = await canReadForm(user.id, payload.formId);
      if (!access.ok) {
        const response: CollabJoinAck = {
          ok: false,
          status: access.error.status,
          message: access.error.message,
        };
        ack?.(response);
        return;
      }

      await socket.join(formRoomName(payload.formId));
      upsertParticipant({
        formId: payload.formId,
        socketId: socket.id,
        user,
        role: access.form.role,
        editingTarget: null,
      });

      const latestSnapshot = await loadBuilderSnapshot(prisma, payload.formId);
      const participants = getParticipants(payload.formId);
      const latestVersion = latestSnapshot?.version ?? access.form.version;
      ack?.({
        ok: true,
        formId: payload.formId,
        role: access.form.role,
        version: latestVersion,
      });

      socket.emit(COLLAB_EVENTS.joined, {
        formId: payload.formId,
        version: latestVersion,
        snapshot: latestSnapshot?.snapshot ?? null,
        participants,
      });

      emitPresence(io, payload.formId);
    });

    socket.on(COLLAB_EVENTS.leave, async (rawPayload) => {
      const payload = parseLeavePayload(rawPayload);
      if (!payload) return;

      removeParticipant(payload.formId, socket.id);
      await socket.leave(formRoomName(payload.formId));
      emitPresence(io, payload.formId);
    });

    socket.on(COLLAB_EVENTS.presenceUpdate, (rawPayload) => {
      const payload = parsePresenceUpdatePayload(rawPayload);
      if (!payload) {
        emitSocketError(socket, { message: "Invalid presence payload", code: "INVALID_PAYLOAD" });
        return;
      }

      if (!socket.rooms.has(formRoomName(payload.formId))) {
        emitSocketError(socket, { message: "Join form room first", code: "FORBIDDEN" });
        return;
      }

      const bySocket = roomPresence.get(payload.formId);
      const participant = bySocket?.get(socket.id);
      if (!participant) return;

      upsertParticipant({
        formId: payload.formId,
        socketId: socket.id,
        user,
        role: participant.role,
        editingTarget: payload.editingTarget,
      });
      emitPresence(io, payload.formId);
    });

    socket.on(COLLAB_EVENTS.syncRequest, async (rawPayload) => {
      const payload = parseSyncRequestPayload(rawPayload);
      if (!payload) {
        emitSocketError(socket, { message: "Invalid sync payload", code: "INVALID_PAYLOAD" });
        return;
      }

      const access = await canReadForm(user.id, payload.formId);
      if (!access.ok) {
        emitSocketError(socket, {
          message: access.error.message,
          code: access.error.status === 403 ? "FORBIDDEN" : "UNKNOWN",
        });
        return;
      }

      const latestSnapshot = await loadBuilderSnapshot(prisma, payload.formId);
      socket.emit(COLLAB_EVENTS.sync, {
        formId: payload.formId,
        version: latestSnapshot?.version ?? access.form.version,
        snapshot: latestSnapshot?.snapshot ?? null,
      });
    });

    socket.on(COLLAB_EVENTS.op, async (rawPayload) => {
      const payload = parseOpPayload(rawPayload);
      if (!payload) {
        emitSocketError(socket, { message: "Invalid operation payload", code: "INVALID_PAYLOAD" });
        return;
      }

      if (!socket.rooms.has(formRoomName(payload.formId))) {
        emitSocketError(socket, { message: "Join form room first", code: "FORBIDDEN" });
        return;
      }

      const access = await canEditForm(user.id, payload.formId);
      if (!access.ok) {
        emitSocketError(socket, {
          message: access.error.message,
          code: access.error.status === 403 ? "FORBIDDEN" : "UNKNOWN",
        });
        return;
      }

      if (payload.baseVersion !== access.form.version) {
        socket.emit(COLLAB_EVENTS.opRejected, {
          formId: payload.formId,
          opId: payload.opId,
          reason: "BASE_VERSION_MISMATCH",
          latestVersion: access.form.version,
        });
        return;
      }

      // Step 6 only defines the contract and server-authoritative version checks.
      // Operation apply + persistence will be implemented in the snapshot/op stages.
      socket.emit(COLLAB_EVENTS.opRejected, {
        formId: payload.formId,
        opId: payload.opId,
        reason: "NOT_IMPLEMENTED",
        latestVersion: access.form.version,
      });
    });

    socket.on("disconnecting", () => {
      const joinedFormIds = getJoinedFormIds(socket);
      for (const formId of joinedFormIds) {
        removeParticipant(formId, socket.id);
        emitPresence(io, formId);
      }
    });
  });

  return io;
};
