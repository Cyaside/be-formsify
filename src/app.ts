import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import routes from "./modules/http/root.routes";
import { errorHandler } from "./middleware/errorHandler";
import { securityHeaders } from "./middleware/securityHeaders";
import { rateLimitAllRequests } from "./middleware/rateLimit";
import { validateRuntimeSecurityConfig } from "./shared/config/config";

validateRuntimeSecurityConfig();

const app = express();
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const defaultOrigin = "http://localhost:3000";
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
const normalizeOrigin = (origin: string) => unwrapEnvString(origin).replace(/\/+$/, "");
const corsOrigins = (process.env.CORS_ORIGIN ?? defaultOrigin)
  .split(",")
  .map(normalizeOrigin)
  .filter((origin) => origin.length > 0);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (no origin) and known origins.
      if (!origin || corsOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(securityHeaders);
app.use(express.json({ limit: "100kb", strict: true }));
app.use(rateLimitAllRequests);

app.use(routes);

const docsPath = path.join(process.cwd(), "docs", "openapi.yaml");
try {
  const raw = fs.readFileSync(docsPath, "utf8");
  const spec = YAML.parse(raw) as Record<string, unknown>;
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(spec));
  app.get("/api-docs.json", (_req, res) => {
    res.json(spec);
  });
} catch {
  // Skip docs if spec not found or invalid.
}

app.use(errorHandler);

export default app;

