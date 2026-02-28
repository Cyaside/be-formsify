const unwrapEnvString = (value: string) => {
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

export const normalizeOrigin = (origin: string) => unwrapEnvString(origin).replace(/\/+$/, "");

export const getAllowedOrigins = ({
  configuredOrigins,
  defaultOrigin,
}: {
  configuredOrigins?: string;
  defaultOrigin: string;
}) =>
  (configuredOrigins ?? defaultOrigin)
    .split(",")
    .map(normalizeOrigin)
    .filter((origin) => origin.length > 0);

export const isAllowedOrigin = (origin: string, allowedOrigins: readonly string[]) =>
  allowedOrigins.includes(normalizeOrigin(origin));

