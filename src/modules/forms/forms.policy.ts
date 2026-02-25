const MAX_RESPONSE_LIMIT = 100_000;

export const FORMS_DEFAULT_THANK_YOU_TITLE = "Thank you!";
export const FORMS_DEFAULT_THANK_YOU_MESSAGE = "Your response has been recorded.";
export const FORMS_DEFAULT_SECTION_TITLE = "Section 1";

export const parseOptionalResponseLimit = (value: unknown) => {
  if (value === undefined) {
    return { provided: false as const, value: undefined as number | null | undefined };
  }
  if (value === null || value === "") {
    return { provided: true as const, value: null };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      provided: true as const,
      error: "responseLimit must be a positive integer.",
    };
  }
  if (parsed > MAX_RESPONSE_LIMIT) {
    return {
      provided: true as const,
      error: `responseLimit maximum is ${MAX_RESPONSE_LIMIT}.`,
    };
  }

  return { provided: true as const, value: parsed };
};
