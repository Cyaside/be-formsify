export const COLLAB_EVENTS = {
  ready: "collab:ready",
  error: "collab:error",
  join: "collab:join",
  leave: "collab:leave",
  joined: "collab:joined",
  presenceUpdate: "collab:presence:update",
  presence: "collab:presence",
  op: "collab:op",
  opApplied: "collab:op:applied",
  opRejected: "collab:op:rejected",
  status: "collab:status",
  syncRequest: "collab:sync:request",
  sync: "collab:sync",
} as const;

export type CollabEventName = (typeof COLLAB_EVENTS)[keyof typeof COLLAB_EVENTS];
export type CollabRole = "OWNER" | "EDITOR" | "NONE";
export type CollabEditingTarget =
  | null
  | {
      kind: "form" | "section" | "question" | "option";
      id?: string;
      field?: string;
    };

export type CollabParticipant = {
  socketId: string;
  user: {
    id: string;
    email: string;
  };
  role: CollabRole;
  editingTarget: CollabEditingTarget;
  joinedAt: string;
  lastSeenAt: string;
};

export type CollabJoinClientPayload = {
  formId: string;
};

export type CollabLeaveClientPayload = {
  formId: string;
};

export type CollabPresenceUpdateClientPayload = {
  formId: string;
  editingTarget: CollabEditingTarget;
};

export type CollabOpClientPayload = {
  formId: string;
  opId: string;
  baseVersion: number;
  type: string;
  payload: unknown;
};

export type CollabSyncRequestClientPayload = {
  formId: string;
};

export type CollabReadyServerPayload = {
  user: {
    id: string;
    email: string;
  };
};

export type CollabErrorServerPayload = {
  message: string;
  code:
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "INVALID_PAYLOAD"
    | "NOT_IMPLEMENTED"
    | "CONFLICT"
    | "UNKNOWN";
};

export type CollabJoinAck =
  | {
      ok: true;
      formId: string;
      role: CollabRole;
      version: number;
    }
  | {
      ok: false;
      message: string;
      status?: number;
    };

export type CollabJoinedServerPayload = {
  formId: string;
  version: number;
  snapshot: {
    title: string;
    description: string | null;
    thankYouTitle: string;
    thankYouMessage: string;
    isClosed: boolean;
    responseLimit: number | null;
    sections: Array<{
      id: string;
      title: string;
      description: string | null;
      order: number;
    }>;
    questions: Array<{
      id: string;
      sectionId: string;
      title: string;
      description: string | null;
      type: "SHORT_ANSWER" | "MCQ" | "CHECKBOX" | "DROPDOWN";
      required: boolean;
      order: number;
      options: string[];
    }>;
  } | null;
  participants: CollabParticipant[];
};

export type CollabPresenceServerPayload = {
  formId: string;
  participants: CollabParticipant[];
};

export type CollabOpAppliedServerPayload = {
  formId: string;
  opId: string;
  nextVersion: number;
  op: CollabOpClientPayload;
  actor: {
    id: string;
    email: string;
  };
};

export type CollabOpRejectedServerPayload = {
  formId: string;
  opId: string;
  reason: string;
  latestVersion: number;
};

export type CollabStatusServerPayload = {
  formId: string;
  kind: "RESPONSES_LOCKED" | "RESYNC_REQUIRED";
  message: string;
  latestVersion: number | null;
};

export type CollabSyncServerPayload = {
  formId: string;
  version: number;
  snapshot: CollabJoinedServerPayload["snapshot"];
};

export interface CollabServerToClientEvents {
  [COLLAB_EVENTS.ready]: (payload: CollabReadyServerPayload) => void;
  [COLLAB_EVENTS.error]: (payload: CollabErrorServerPayload) => void;
  [COLLAB_EVENTS.joined]: (payload: CollabJoinedServerPayload) => void;
  [COLLAB_EVENTS.presence]: (payload: CollabPresenceServerPayload) => void;
  [COLLAB_EVENTS.opApplied]: (payload: CollabOpAppliedServerPayload) => void;
  [COLLAB_EVENTS.opRejected]: (payload: CollabOpRejectedServerPayload) => void;
  [COLLAB_EVENTS.status]: (payload: CollabStatusServerPayload) => void;
  [COLLAB_EVENTS.sync]: (payload: CollabSyncServerPayload) => void;
}

export interface CollabClientToServerEvents {
  [COLLAB_EVENTS.join]: (
    payload: CollabJoinClientPayload,
    ack?: (response: CollabJoinAck) => void,
  ) => void;
  [COLLAB_EVENTS.leave]: (payload: CollabLeaveClientPayload) => void;
  [COLLAB_EVENTS.presenceUpdate]: (payload: CollabPresenceUpdateClientPayload) => void;
  [COLLAB_EVENTS.op]: (payload: CollabOpClientPayload) => void;
  [COLLAB_EVENTS.syncRequest]: (payload: CollabSyncRequestClientPayload) => void;
}

export interface CollabInterServerEvents {}

export type CollabSocketData = {
  user?: {
    id: string;
    email: string;
  };
};
