import { Router } from "express";
import authRouter from "./auth";
import analyticsRouter from "./analytics";
import formsRouter from "./forms";
import questionsRouter from "./questions";
import sectionsRouter from "./sections";
import { login, register } from "../controllers/auth.controller";
import { validateRequest } from "../middleware/validateRequest";
import { schemas } from "../validation/requestSchemas";

const router = Router();

router.get("/", (_req, res) => {
  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Formsify Backend</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --card: #fffaf3;
        --ink: #1f1a15;
        --muted: #6f675f;
        --accent: #0f766e;
        --accent-hover: #115e59;
        --border: #e8dccf;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at 20% 10%, rgba(15,118,110,0.10), transparent 45%),
          radial-gradient(circle at 80% 20%, rgba(217,119,6,0.08), transparent 40%),
          var(--bg);
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
      }
      .card {
        width: min(560px, 100%);
        border: 1px solid var(--border);
        border-radius: 20px;
        background: var(--card);
        padding: 28px;
        box-shadow: 0 16px 40px rgba(31, 26, 21, 0.08);
        text-align: center;
      }
      h1 {
        margin: 0 0 8px;
        font-size: clamp(1.6rem, 4vw, 2.2rem);
        line-height: 1.2;
      }
      p {
        margin: 0 0 20px;
        color: var(--muted);
        font-size: 0.95rem;
      }
      a.button {
        display: inline-block;
        text-decoration: none;
        background: var(--accent);
        color: white;
        padding: 10px 16px;
        border-radius: 999px;
        font-weight: 600;
        transition: background 120ms ease;
      }
      a.button:hover {
        background: var(--accent-hover);
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>I wonder what you're looking for?</h1>
      <p>This is the Formsify backend service. The web app lives on the frontend.</p>
      <a
        class="button"
        href="https://fe-formsify-production.up.railway.app"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open Formsify Frontend
      </a>
    </main>
  </body>
</html>`);
});

router.get("/health", validateRequest({ query: schemas.emptyQuery }), (_req, res) => {
  res.json({ status: "ok" });
});

router.post("/register", validateRequest({ body: schemas.rootRegisterBody }), register);
router.post("/login", validateRequest({ body: schemas.rootLoginBody }), login);

router.use("/api/auth", authRouter);
router.use("/api/analytics", analyticsRouter);
router.use("/api/forms", formsRouter);
router.use("/api/questions", questionsRouter);
router.use("/api/sections", sectionsRouter);

export default router;
