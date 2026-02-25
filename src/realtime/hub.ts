import type { CollabStatusServerPayload } from "./events";

type StatusBroadcaster = (payload: CollabStatusServerPayload) => void;

let statusBroadcaster: StatusBroadcaster | null = null;

export const registerCollabStatusBroadcaster = (
  broadcaster: StatusBroadcaster | null,
) => {
  statusBroadcaster = broadcaster;
};

export const broadcastCollabStatus = (payload: CollabStatusServerPayload) => {
  statusBroadcaster?.(payload);
};

