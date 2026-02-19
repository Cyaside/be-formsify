import "dotenv/config";
import cors from "cors";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import prisma from "./lib/prisma";
import { authRequired, hashPassword, signToken, verifyPassword } from "./lib/auth";

const app = express();
app.use(cors());
app.use(express.json());

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
const googleClient = googleClientId
  ? new OAuth2Client(googleClientId, googleClientSecret, googleRedirectUri)
  : null;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const name = String(req.body.name ?? "").trim();

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: "Email is already registered" });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name || null,
      provider: "LOCAL",
    },
    select: {
      id: true,
      email: true,
      name: true,
      provider: true,
      createdAt: true,
    },
  });

  const token = signToken({ id: user.id, email: user.email });
  return res.status(201).json({ token, user });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signToken({ id: user.id, email: user.email });
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
    },
  });
});

app.post("/api/auth/google", async (req, res) => {
  if (!googleClient || !googleClientId) {
    return res.status(500).json({ message: "Google OAuth is not configured" });
  }

  let idToken = String(req.body.idToken ?? "");
  const code = String(req.body.code ?? "");
  if (!idToken && !code) {
    return res.status(400).json({ message: "idToken or code is required" });
  }

  try {
    if (!idToken && code) {
      if (!googleClientSecret || !googleRedirectUri) {
        return res.status(500).json({
          message: "Google OAuth code exchange is not configured",
        });
      }
      const { tokens } = await googleClient.getToken(code);
      idToken = tokens.id_token ?? "";
    }

    if (!idToken) {
      return res.status(401).json({ message: "Invalid Google token" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      return res.status(401).json({ message: "Invalid Google token" });
    }
    if (payload.email_verified === false) {
      return res.status(401).json({ message: "Google email is not verified" });
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const name = payload.name ?? null;

    let user = await prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      const existingByEmail = await prisma.user.findUnique({ where: { email } });
      if (existingByEmail) {
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email,
            name,
            provider: "GOOGLE",
            googleId,
          },
        });
      }
    }

    const token = signToken({ id: user.id, email: user.email });
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
      },
    });
  } catch (error) {
    return res.status(401).json({ message: "Invalid Google token" });
  }
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, provider: true, createdAt: true },
  });
  return res.json({ user });
});

app.get("/api/forms", authRequired, async (req, res) => {
  const forms = await prisma.form.findMany({
    where: { ownerId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, email: true, name: true } },
    },
  });
  return res.json({ data: forms });
});

app.get("/api/forms/:id", async (req, res) => {
  const form = await prisma.form.findUnique({
    where: { id: req.params.id },
    include: { owner: { select: { id: true, email: true, name: true } } },
  });
  if (!form) {
    return res.status(404).json({ message: "Form not found" });
  }
  return res.json({ data: form });
});

app.post("/api/forms", authRequired, async (req, res) => {
  const title = String(req.body.title ?? "").trim();
  const descriptionRaw = req.body.description;
  const description =
    descriptionRaw === null || descriptionRaw === undefined
      ? null
      : String(descriptionRaw).trim();

  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }

  const form = await prisma.form.create({
    data: {
      title,
      description,
      ownerId: req.user!.id,
    },
    include: { owner: { select: { id: true, email: true, name: true } } },
  });

  return res.status(201).json({ data: form });
});

app.put("/api/forms/:id", authRequired, async (req, res) => {
  const form = await prisma.form.findUnique({ where: { id: req.params.id } });
  if (!form) {
    return res.status(404).json({ message: "Form not found" });
  }
  if (form.ownerId !== req.user!.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const data: { title?: string; description?: string | null } = {};
  if (req.body.title !== undefined) {
    const title = String(req.body.title ?? "").trim();
    if (!title) {
      return res.status(400).json({ message: "Title cannot be empty" });
    }
    data.title = title;
  }
  if (req.body.description !== undefined) {
    data.description =
      req.body.description === null ? null : String(req.body.description).trim();
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  const updated = await prisma.form.update({
    where: { id: req.params.id },
    data,
    include: { owner: { select: { id: true, email: true, name: true } } },
  });

  return res.json({ data: updated });
});

app.delete("/api/forms/:id", authRequired, async (req, res) => {
  const form = await prisma.form.findUnique({ where: { id: req.params.id } });
  if (!form) {
    return res.status(404).json({ message: "Form not found" });
  }
  if (form.ownerId !== req.user!.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await prisma.form.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
