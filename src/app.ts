import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());

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
