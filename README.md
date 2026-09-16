# ClassRoom

Minimal student–mentor class scheduling with built-in video (Agora) and in-app class recordings (browser-side capture → Cloudflare R2 → ffmpeg → stream-only playback).

Next.js 15 App Router · TypeScript · Tailwind · Prisma (SQLite locally, PostgreSQL in prod) · NextAuth credentials · agora-rtc-sdk-ng · @aws-sdk/client-s3 (R2's S3 API; no AWS account) · ffmpeg-static.

## Setup

```bash
npm install
cp .env.example .env        # then fill in the values below
npx prisma db push          # creates prisma/dev.db (SQLite)
npm run db:seed             # admin@test.com / mentor@test.com / student@test.com — password test1234
npm run dev                 # http://localhost:3000
npm test                    # Vitest: overlap, join window, slot generation, Range parser
```

> **If `npm install` fails on `ffmpeg-static`** (its postinstall downloads the binary from GitHub releases): run `npm install --ignore-scripts && npx prisma generate`, then download `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-<platform>-<arch>.gz` (e.g. `ffmpeg-win32-x64.gz`, `ffmpeg-linux-x64.gz`), gunzip it, and place it at `node_modules/ffmpeg-static/ffmpeg` (`ffmpeg.exe` on Windows).

### Environment variables

| Variable | What |
|---|---|
| `DATABASE_URL` | `file:./dev.db` for SQLite. For PostgreSQL, set the URL **and** change `provider = "postgresql"` in `prisma/schema.prisma` (enums are stored as strings so nothing else changes). |
| `NEXTAUTH_URL` | `http://localhost:3000` locally; your public URL in prod. |
| `NEXTAUTH_SECRET` | Any long random string (`openssl rand -hex 32`). |
| `AGORA_APP_ID` | From [console.agora.io](https://console.agora.io) → Projects → your project. Sent to the browser. |
| `AGORA_APP_CERTIFICATE` | Same page → Primary Certificate. **Server-only**, used to mint RTC tokens. |
| `R2_ACCOUNT_ID` | Cloudflare dashboard → R2 → the Account ID shown on the overview (also in the bucket's S3 endpoint URL). |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | From the R2 API token (below). |
| `R2_BUCKET` | Bucket name, e.g. `classroom-recordings`. |

### Agora (free, no card)

1. Sign up at console.agora.io → **Create a project** → authentication mode **Secured mode: APP ID + Token**.
2. Copy **App ID** → `AGORA_APP_ID`; click the eye next to **Primary Certificate** → `AGORA_APP_CERTIFICATE`.

### Cloudflare R2 bucket + API token (free tier, no card)

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket** → name it (e.g. `classroom-recordings`), location *Automatic* → Create. Set `R2_BUCKET` to that name.
2. On the R2 overview, copy your **Account ID** → `R2_ACCOUNT_ID`.
3. R2 overview → **Manage R2 API Tokens** → **Create API token**:
   - Permissions: **Object Read & Write**
   - Specify bucket(s): pick your bucket
   - TTL: forever (or as you like) → **Create API Token**.
4. Copy **Access Key ID** → `R2_ACCESS_KEY_ID` and **Secret Access Key** → `R2_SECRET_ACCESS_KEY` (shown once).

The S3 client is configured as `endpoint: https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, `region: "auto"`, `forcePathStyle: true`. Object keys: `recordings/<classId>/raw.webm` (deleted after transcode) and `recordings/<classId>/class.mp4`.

## Manual test (two browsers)

1. **Mentor** (`mentor@test.com`) → **Availability** → the seed already has Mon–Fri 09:00–17:00; click cells to add/remove hour blocks.
2. **Admin** (`admin@test.com`) → **Book** → pick the student + mentor, date = tomorrow, choose a slot → **Confirm booking**. It appears under *Upcoming* with "Opens 10m before".
3. **Admin** → **Admin** page → in the *All classes* table click **Start now** on that class (it PATCHes `startAt` to now with `force: true`; only the overlap rule is enforced). The class moves to *Live now* on everyone's schedule and appears under *In progress now*.
4. Open a second browser (or a private window) as **Student** (`student@test.com`). Both click **Join**. Allow camera + mic. You should see local + remote tiles, mute / camera toggles, and the header clock (`m:ss elapsed · ends in m:ss`, amber after `endAt`).
5. On the **mentor's** side a red **REC** dot appears once the recording starts (it's the mentor's browser doing the compositing + upload).
6. Talk for a minute, then mentor clicks **End class** → both browsers see *Class ended* and are disconnected. The card is now *completed* and shows "Recording is being prepared…".
7. Within ~2 minutes (upload completes → ffmpeg transcode) the card shows **Watch recording**. Open it: the video plays in-app, seeking works (HTTP 206 Range), there is no download control and no picture-in-picture. Check DevTools → Network: the `<video>` src is `/api/recordings/<id>/stream` (no R2 URL) with `Content-Disposition: inline`, `Cache-Control: private, no-store`.
8. **Admin** page → *Recording* column shows `READY`. If a transcode fails, it shows `FAILED` with a **Retry** button (the 5-minute sweep also retries automatically).

Deny camera permission once to see the readable error ("Camera or microphone access is blocked…").

## How it fits together

- **Scheduling** — `src/lib/rules.ts` is pure (overlap, join window, slot generation, Range parser) and unit-tested. `src/lib/classes.ts#assertBookable` applies them server-side for create + reschedule: 60-min classes on :00/:30, inside the mentor's weekly availability (evaluated in the mentor's timezone), no overlap for mentor or student (CANCELLED ignored), role checks. Cancel sets `CANCELLED`, never deletes.
- **Video** — every class owns channel `class-<id>` from creation. `POST /api/classes/[id]/join` checks participant + time window (10 min before → 60 min after) and returns a 2-hour publisher token. The room polls class status every 10 s so everyone is disconnected when the mentor ends it.
- **Recording** — `src/app/room/[classId]/recorder.ts` composites tiles onto a 1280×720@15fps canvas with name labels, mixes audio via `AudioContext`, records `video/webm;codecs=vp8,opus` at ~1.5 Mbps with 10 s timeslices, and streams ≥5 MB parts to `PUT /api/recordings/[classId]/part?n=` which forwards each to an R2 multipart upload (ETags kept on the `Recording` row). `finish` completes the upload (`UPLOADED`) and queues the transcode.
- **Transcode** — `src/lib/transcode.ts`: in-process queue, one at a time: download raw.webm → `ffmpeg -i raw.webm -c:v libx264 -preset veryfast -crf 26 -c:a aac -movflags +faststart` → upload class.mp4 → delete raw → `READY` (duration parsed from ffmpeg's last `time=` line). Started by `finish`, and a 5-minute sweep (`src/instrumentation.ts`) retries `UPLOADED`/`FAILED` rows and finalizes uploads abandoned by a closed mentor tab using the parts already in R2.
- **Playback** — `GET /api/recordings/[classId]/stream` authorizes the viewer and proxies the mp4 from R2 with Range support. No presigned URLs ever reach the browser.

## API

All routes return `{ success: true, data }` or `{ success: false, message }` with 4xx for rule violations (messages are shown as toasts).

| Route | Who | Purpose |
|---|---|---|
| `GET/POST /api/classes` | all / admin+mentor | list (scoped by role) / book |
| `GET/PATCH /api/classes/[id]` | participants / admin+mentor | read / reschedule `{startAt}` · cancel `{status:"CANCELLED"}` · admin `{startAt, force:true}` |
| `POST /api/classes/[id]/join` | participants | Agora `{ appId, channelName, token, uid, expiresAt }` |
| `POST /api/classes/[id]/complete` | class mentor / admin | mark COMPLETED |
| `GET/POST/DELETE /api/availability` | mentor (GET also admin) | weekly blocks |
| `GET /api/slots?mentorId&date[&studentId][&exclude]` | admin+mentor | free 60-min slots |
| `GET /api/recordings/[classId]` | viewers | recording status |
| `POST …/start` · `PUT …/part?n=` · `POST …/finish` · `POST …/abort` | class mentor / admin | multipart upload lifecycle |
| `GET …/stream` | viewers | Range-capable mp4 stream |
| `POST …/retry` | admin | re-queue transcode |

## Phase 2 anchors

`Recording.key` (the mp4 in R2) and `Recording.durationSec` are the inputs for transcription + summary later; the player page (`src/app/recordings/[classId]/page.tsx`) is where a summary would render beneath the video. To remove the dependence on the mentor's browser, swap the recorder for Agora Cloud Recording writing to a supported vendor bucket; everything from the `UPLOADED` state onward stays the same.
