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
import { createCsrfGuard } from "./middleware/csrfGuard";
import { getAllowedOrigins, isAllowedOrigin } from "./shared/security/origin";

validateRuntimeSecurityConfig();

const app = express();
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const defaultOrigin = "http://localhost:3000";
const corsOrigins = getAllowedOrigins({
  configuredOrigins: process.env.CORS_ORIGIN,
  defaultOrigin,
});
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (no origin) and known origins.
      if (!origin || isAllowedOrigin(origin, corsOrigins)) {
        return callback(null, true);
      }
      const error = Object.assign(new Error("Blocked by CORS: origin is not allowed"), {
        status: 403,
        code: "CORS_ORIGIN_NOT_ALLOWED",
        origin,
        hint: "Add the origin to CORS_ORIGIN on backend.",
      });
      return callback(error);
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(securityHeaders);
app.use(express.json({ limit: "100kb", strict: true }));
app.use(rateLimitAllRequests);
app.use(createCsrfGuard({ allowedOrigins: corsOrigins }));

app.use(routes);

const docsPathCandidates = [
  path.join(process.cwd(), "docs", "openapi.yaml"),
  path.resolve(__dirname, "..", "docs", "openapi.yaml"),
  path.join(process.cwd(), "be-formsify", "docs", "openapi.yaml"),
];
const docsPath = docsPathCandidates.find((candidate) => fs.existsSync(candidate));
if (docsPath) {
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
}

app.use(errorHandler);

export default app;

