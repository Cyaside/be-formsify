type ValidationIssue = {
  path: string;
  message: string;
};

export class RequestValidationError extends Error {
  public readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[] | ValidationIssue, message = "Invalid request") {
    super(message);
    this.name = "RequestValidationError";
    this.issues = Array.isArray(issues) ? issues : [issues];
  }
}

export type Parser<T> = (value: unknown, path: string) => T;

type InferParser<TParser> = TParser extends Parser<infer TValue> ? TValue : never;
type ParserShape = Record<string, Parser<unknown>>;
type InferObject<TShape extends ParserShape> = {
  [K in keyof TShape]: InferParser<TShape[K]>;
};

type StringOptions = {
  trim?: boolean;
  toLowerCase?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  allowEmpty?: boolean;
};

type NumberOptions = {
  integer?: boolean;
  min?: number;
  max?: number;
  coerceString?: boolean;
};

type BooleanOptions = {
  coerceString?: boolean;
};

type ArrayOptions = {
  minLength?: number;
  maxLength?: number;
};

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const SAFE_ID_REGEX = /^[A-Za-z0-9_-]+$/;
const ISO_DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const fail = (path: string, message: string): never => {
  throw new RequestValidationError({ path, message });
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const sanitizeString = (value: string, options: StringOptions) => {
  let next = value.replace(CONTROL_CHARS_REGEX, "");
  if (options.trim !== false) {
    next = next.trim();
  }
  if (options.toLowerCase) {
    next = next.toLowerCase();
  }
  return next;
};

export const v = {
  string: (options: StringOptions = {}): Parser<string> => {
    return (value, path) => {
      const raw = value;
      if (typeof raw !== "string") {
        fail(path, "Expected string");
      }

      const next = sanitizeString(raw as string, options);
      if (!options.allowEmpty && next.length === 0) {
        fail(path, "Cannot be empty");
      }
      if (
        typeof options.minLength === "number" &&
        next.length < options.minLength
      ) {
        fail(path, `Must be at least ${options.minLength} characters`);
      }
      if (
        typeof options.maxLength === "number" &&
        next.length > options.maxLength
      ) {
        fail(path, `Must be at most ${options.maxLength} characters`);
      }
      if (options.pattern && !options.pattern.test(next)) {
        fail(path, options.patternMessage ?? "Invalid format");
      }
      return next;
    };
  },

  boolean: (options: BooleanOptions = {}): Parser<boolean> => {
    return (value, path) => {
      if (typeof value === "boolean") {
        return value;
      }
      if (options.coerceString && typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") return true;
        if (normalized === "false") return false;
      }
      return fail(path, "Expected boolean");
    };
  },

  number: (options: NumberOptions = {}): Parser<number> => {
    return (value, path) => {
      const parsed: number =
        typeof value === "number"
          ? value
          : options.coerceString && typeof value === "string"
            ? (() => {
                const trimmed = value.trim();
                if (!trimmed) fail(path, "Expected number");
                return Number(trimmed);
              })()
            : fail(path, "Expected number");

      if (!Number.isFinite(parsed)) {
        fail(path, "Expected number");
      }
      if (options.integer && !Number.isInteger(parsed)) {
        fail(path, "Expected integer");
      }
      if (typeof options.min === "number" && parsed < options.min) {
        fail(path, `Must be >= ${options.min}`);
      }
      if (typeof options.max === "number" && parsed > options.max) {
        fail(path, `Must be <= ${options.max}`);
      }
      return parsed;
    };
  },

  enum: <TValue extends string>(values: readonly TValue[]): Parser<TValue> => {
    const allowed = new Set(values);
    return (value, path) => {
      const raw = value;
      if (typeof raw !== "string") {
        fail(path, `Expected one of: ${values.join(", ")}`);
      }
      const normalized = sanitizeString(raw as string, { trim: true });
      if (!allowed.has(normalized as TValue)) {
        fail(path, `Expected one of: ${values.join(", ")}`);
      }
      return normalized as TValue;
    };
  },

  dateOnly: (): Parser<string> => {
    return (value, path) => {
      const raw = value;
      if (typeof raw !== "string") {
        fail(path, "Expected date string (YYYY-MM-DD)");
      }
      const next = sanitizeString(raw as string, { trim: true });
      if (!ISO_DATE_ONLY_REGEX.test(next)) {
        fail(path, "Expected date string (YYYY-MM-DD)");
      }
      return next;
    };
  },

  id: (): Parser<string> => {
    return (value, path) => {
      const raw = value;
      if (typeof raw !== "string") {
        fail(path, "Expected identifier");
      }
      const next = sanitizeString(raw as string, { trim: true });
      if (next.length === 0 || next.length > 128) {
        fail(path, "Invalid identifier length");
      }
      if (!SAFE_ID_REGEX.test(next)) {
        fail(path, "Invalid identifier format");
      }
      return next;
    };
  },

  array: <TItem>(itemParser: Parser<TItem>, options: ArrayOptions = {}): Parser<TItem[]> => {
    return (value, path) => {
      if (!Array.isArray(value)) {
        fail(path, "Expected array");
      }
      const arr = value as unknown[];
      if (typeof options.minLength === "number" && arr.length < options.minLength) {
        fail(path, `Must contain at least ${options.minLength} item(s)`);
      }
      if (typeof options.maxLength === "number" && arr.length > options.maxLength) {
        fail(path, `Must contain at most ${options.maxLength} item(s)`);
      }
      return arr.map((entry: unknown, index: number) =>
        itemParser(entry, `${path}[${index}]`),
      );
    };
  },

  object: <TShape extends ParserShape>(shape: TShape): Parser<InferObject<TShape>> => {
    return (value, path) => {
      if (!isPlainObject(value)) {
        fail(path, "Expected object");
      }

      const raw = value as Record<string, unknown>;
      const allowedKeys = new Set(Object.keys(shape));
      const extraKeys = Object.keys(raw).filter((key) => !allowedKeys.has(key));
      if (extraKeys.length > 0) {
        fail(
          path,
          `Unexpected field(s): ${extraKeys.join(", ")}`,
        );
      }

      const result: Record<string, unknown> = {};
      for (const [key, parser] of Object.entries(shape)) {
        result[key] = parser(raw[key], `${path}.${key}`);
      }
      return result as InferObject<TShape>;
    };
  },

  optional: <TValue>(parser: Parser<TValue>): Parser<TValue | undefined> => {
    return (value, path) => {
      if (value === undefined) {
        return undefined;
      }
      return parser(value, path);
    };
  },

  nullable: <TValue>(parser: Parser<TValue>): Parser<TValue | null> => {
    return (value, path) => {
      if (value === null) {
        return null;
      }
      return parser(value, path);
    };
  },
};

export const strictObject = v.object;
