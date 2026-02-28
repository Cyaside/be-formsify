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

const hasValue = (value?: string) => Boolean(unwrapEnvString(value));
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const parseBooleanEnv = (value?: string) => {
  const normalized = unwrapEnvString(value);
  if (!normalized) {
    return { provided: false as const, value: false };
  }

  const lower = normalized.toLowerCase();
  if (TRUE_VALUES.has(lower)) {
    return { provided: true as const, value: true };
  }
  if (FALSE_VALUES.has(lower)) {
    return { provided: true as const, value: false };
  }

  return {
    provided: true as const,
    error: `Invalid boolean value "${normalized}"`,
  };
};

export const isFormCollabEnabled = () => {
  const parsed = parseBooleanEnv(process.env.ENABLE_FORM_COLLAB);
  if ("error" in parsed) {
    return false;
  }
  return parsed.value;
};

export const validateRuntimeSecurityConfig = () => {
  const issues: string[] = [];

  const jwtSecret = unwrapEnvString(process.env.JWT_SECRET);
  if (!jwtSecret) {
    issues.push("JWT_SECRET is required");
  } else if (jwtSecret.length < 32) {
    issues.push("JWT_SECRET should be at least 32 characters");
  }

  const googleConfigValues = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  ];
  const enabledGoogleFields = googleConfigValues.filter((entry) => hasValue(entry)).length;
  if (enabledGoogleFields > 0 && enabledGoogleFields < googleConfigValues.length) {
    issues.push(
      "Google OAuth config is partial. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI together",
    );
  }

  const formCollabFlag = parseBooleanEnv(process.env.ENABLE_FORM_COLLAB);
  if ("error" in formCollabFlag) {
    issues.push(
      `${formCollabFlag.error} for ENABLE_FORM_COLLAB (allowed: true/false/1/0/yes/no/on/off)`,
    );
  }

  if (issues.length > 0) {
    throw new Error(`Security configuration error: ${issues.join("; ")}`);
  }
};
