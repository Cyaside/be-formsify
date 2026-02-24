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

  if (issues.length > 0) {
    throw new Error(`Security configuration error: ${issues.join("; ")}`);
  }
};
