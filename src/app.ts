import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
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

app.use(errorHandler);

export default app;
