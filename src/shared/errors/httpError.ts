export class HttpServiceError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(typeof payload.message === "string" ? payload.message : `HTTP ${status}`);
    this.name = "HttpServiceError";
    this.status = status;
    this.payload = payload;
  }
}

export const httpError = (status: number, message: string) =>
  new HttpServiceError(status, { message });
