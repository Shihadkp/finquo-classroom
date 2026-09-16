# Deploying (free, no card)

| Piece | Service | Why |
|---|---|---|
| App (Next.js + background transcode) | **Render** web service, free plan | Needs a real Node process: 5 MB recording chunks, ffmpeg transcoding, SSE streams. Vercel's serverless limits (4.5 MB bodies, short timeouts) break recordings. |
| Database | **Neon** Postgres, free plan | SQLite lives on disk and Render's free disk is wiped on every deploy. |
| Recordings | Backblaze B2 (already set up) | Unchanged. |
| Video | Agora (already set up) | Unchanged. |
| Quo | Groq (already set up) | Unchanged. |

Free-plan reality: Render sleeps the app after 15 minutes idle, so the first visit after a quiet spell takes ~30 s.
Recording transcodes run inside the app; if it sleeps mid-job, use **Retry** on the admin overview. `$7/month` on Render makes it always-on.

## 1. Database: Neon

1. neon.tech → sign up → **New project** (any name, region closest to your users).
2. Copy the **connection string** (starts `postgresql://…` and ends `?sslmode=require`).
3. In `prisma/schema.prisma` change `provider = "sqlite"` to `provider = "postgresql"`.
4. Put the Neon string in your local `.env` as `DATABASE_URL`, then run:

```
npx prisma db push
npm run db:seed
```

That creates the tables in Neon and the test accounts + sample program. Local dev now uses Neon too; keep `file:./dev.db` around only if you want to switch back.

## 2. Code on GitHub

Render deploys from a Git repo. `.env` and the SQLite file are already git-ignored.

```
git add -A
git commit -m "Deploy config"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 3. App: Render

1. render.com → sign up with GitHub → **New → Blueprint** → pick the repo. Render reads `render.yaml`.
2. Fill in the environment variables it asks for. Copy them from your local `.env`, except:
   - `DATABASE_URL` = the Neon string
   - `NEXTAUTH_URL` is not asked for: the start command sets it from Render's own `RENDER_EXTERNAL_URL`
   - `NEXTAUTH_SECRET` is generated for you
3. Click **Apply**. The first build takes 3–5 minutes. The build runs `prisma db push`, so future schema changes deploy themselves.

Every `git push` to `main` redeploys.

## 4. After the first deploy

- Log in with the seeded accounts, change the passwords, add real users (admin → Students / Mentors).
- Test a class in two browsers: mic, camera, **Present screen**, recording appears under admin → Recordings after the class ends.
- Quo needs Chrome or Edge on the student's side.

## Later, if traffic grows

- Render Starter ($7): no sleeping, more RAM for ffmpeg.
- Neon free is 0.5 GB; plenty for years of classes (recordings are in Backblaze, not the DB).
- Groq free tier is rate-limited per minute; if Quo returns 429s with many students at once, add a second key or move to a paid tier.
