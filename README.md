# Formsify Backend (`be-formsify`)

Backend Formsify dibangun dengan Express + Prisma + PostgreSQL.

## Repository Links

- Backend repo: https://github.com/Cyaside/be-formsify
- Frontend repo: https://github.com/Cyaside/fe-formsify

## Tech Stack

- Node.js
- Express 5
- TypeScript 5
- Prisma ORM + PostgreSQL (`pg` + `@prisma/adapter-pg`)
- JWT auth (`jsonwebtoken`) + password hashing (`bcrypt`)
- Cookie-based auth (`cookie-parser`)
- CORS middleware (`cors`)
- Socket.IO (realtime collaboration)
- Swagger UI (`swagger-ui-express`) + YAML parser (`yaml`) untuk OpenAPI docs

## Prasyarat

- Node.js 20+
- npm
- PostgreSQL aktif dan bisa diakses

## Environment Variables

Buat file `be-formsify/.env`: atau bisa cek di .env.example

```env
# Database from Prisma
# JWT wajib 32 minimum
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB
JWT_SECRET=isi-dengan-minimal-32-karakter
PORT=4000
CORS_ORIGIN=http://localhost:3000

# Optional
ENABLE_FORM_COLLAB=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_DOMAIN=
OPENAPI_SPEC_PATH=
```

Keterangan minimum:

- `DATABASE_URL`: koneksi PostgreSQL.
- `JWT_SECRET`: wajib, minimal 32 karakter.
- `PORT`: disarankan `4000` agar tidak konflik dengan frontend `3000`.
- `CORS_ORIGIN`: origin frontend yang diizinkan.

## Instalasi dan Menjalankan (Lokal)

```bash
cd be-formsify
npm install
npm run prisma:migrate:deploy
npm run prisma:generate
npm run dev
```

Backend default di `http://localhost:4000`.

## Menjalankan di Production

Pastikan migrasi dijalankan sebelum start server:

```bash
cd be-formsify
npm install
npm run prisma:migrate:deploy
npm run build
npm run start
```

## OpenAPI / Swagger

File source OpenAPI:

- `be-formsify/docs/openapi.yaml`

Saat server berjalan, docs tersedia di:

- `/api-docs`
- `/api/docs`
- `/docs`

JSON spec:

- `/api-docs.json`
- `/api/docs.json`
- `/docs/openapi.json`

Contoh lokal:

- `http://localhost:4000/api-docs`

## Scripts

- `npm run dev`: jalankan server development (`ts-node-dev`).
- `npm run build`: generate Prisma client, compile TypeScript, copy OpenAPI spec ke `dist/docs`.
- `npm run start`: jalankan server production dari `dist`.
- `npm run prisma:migrate`: migration dev mode.
- `npm run prisma:migrate:deploy`: apply migration existing (aman untuk deploy).
- `npm run prisma:generate`: generate Prisma client.
