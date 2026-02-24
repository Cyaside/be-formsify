import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { AUTH_COOKIE_NAME, getTokenFromAuthHeader, verifyToken } from "../lib/auth";
import { isFormCollabEnabled } from "../lib/config";
import { canReadForm } from "../lib/formAccess";

type SocketUser = {
  id: string;
  email: string;
};

type JoinPayload = {
  formId: string;
};

type JoinAck =
  | {
      ok: true;
      formId: string;
      role: "OWNER" | "EDITOR" | "VIEWER" | "NONE";
    }
  | {
      ok: false;
      message: string;
      status?: number;
    };

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

const getSocketToken = (socket: Socket) => {
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

const isNonEmptyObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseJoinPayload = (value: unknown): JoinPayload | null => {
  if (!isNonEmptyObject(value)) return null;
  const formId =
    typeof value.formId === "string" ? value.formId.trim() : "";
  if (!formId) return null;
  return { formId };
};

const emitAuthErrorAndDisconnect = (socket: Socket, message: string) => {
  socket.emit("collab:error", { message, code: "UNAUTHORIZED" });
  socket.disconnect(true);
};

export const setupRealtimeServer = (httpServer: HttpServer) => {
  if (!isFormCollabEnabled()) {
    return null;
  }

  const io = new SocketIOServer(httpServer, {
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
      } satisfies SocketUser;

      return next();
    } catch {
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as SocketUser | undefined;
    if (!user) {
      emitAuthErrorAndDisconnect(socket, "Unauthorized");
      return;
    }

    socket.emit("collab:ready", {
      user: {
        id: user.id,
        email: user.email,
      },
    });

    socket.on("collab:join", async (rawPayload: unknown, ack?: (response: JoinAck) => void) => {
      const payload = parseJoinPayload(rawPayload);
      if (!payload) {
        const response: JoinAck = { ok: false, status: 400, message: "Invalid formId" };
        if (typeof ack === "function") ack(response);
        return;
      }

      const access = await canReadForm(user.id, payload.formId);
      if (!access.ok) {
        const response: JoinAck = {
          ok: false,
          status: access.error.status,
          message: access.error.message,
        };
        if (typeof ack === "function") ack(response);
        return;
      }

      void socket.join(`form:${payload.formId}`);
      const response: JoinAck = {
        ok: true,
        formId: payload.formId,
        role: access.form.role,
      };
      if (typeof ack === "function") ack(response);
    });

    socket.on("collab:leave", async (rawPayload: unknown) => {
      const payload = parseJoinPayload(rawPayload);
      if (!payload) return;
      await socket.leave(`form:${payload.formId}`);
    });
  });

  return io;
};

