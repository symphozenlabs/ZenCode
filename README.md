# ZenCode

ZEN CODE 2026 — Hackathon & Pitch Fest registration, plus an organiser control center and live games.

Built with SvelteKit (Svelte 5) on Vercel, Firebase Authentication (organisers only), Cloud Firestore and Resend.

## Experiences

| Area | Routes | Access |
| --- | --- | --- |
| Registration (from `main`) | `/`, `/check-in/{teamId}`, `/api/registration/send-confirmation` | Anyone |
| Admin | `/admin/login`, `/admin`, `/admin/hackathon`, `/admin/pitch-fest`, `/admin/settings`, `/admin/games` | Organisers |
| Live games | `/join`, `/join/{code}` (players, no account) · `/admin/games/tech-word-rush/live/{code}` (presenter) | Players / organisers |
| Live sessions | `/admin/live`, `/admin/live/{id}/present` (organisers) · `/join`, `/play/{code}` (phones, no account) | Organisers / anyone with the code |

The registration site is `main`'s app, unchanged: `src/App.svelte`, `src/lib/*.svelte`, `src/lib/firebase.js`, `src/lib/server/*.js` and `src/site.css` (main's `src/app.css`). It's mounted by `src/routes/(registration)/` with SSR off, so it behaves exactly like the original single-page app. Keep those files in sync with `main` rather than editing them here.

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `VITE_FIREBASE_*` — the web app config (shared by registration, admin and games; `kit.env.publicPrefix` is `VITE_`).
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PUBLIC_SITE_URL` — confirmation emails.
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — the organiser login. Server only; never commit or prefix with `VITE_`.
2. Publish `firestore.rules` (Firebase Console → Firestore → Rules, or `firebase deploy --only firestore:rules`). If you change `ADMIN_EMAIL`, update the email in `isAdmin()` too.
3. Run it:
   ```sh
   npm install
   npm run dev
   ```

On Vercel, set the same variables in the project settings.

### Live sessions on Vercel

Live sessions need a long-running server (WebSockets plus in-memory rooms), which Vercel can't host. Run `server.js` on a Node host (Render, Railway, Fly, a VM) and point the Vercel site at it:

1. **Live server** — on Render, use the Blueprint in `render.yaml` (New → Blueprint → this repo; paste the secret values it asks for). Elsewhere: build `npm ci && npm run build`, start `npm start` (Node 22.9+ for `--env-file-if-exists`; listens on `PORT`). Give it the same env vars as Vercel, plus `LIVE_ALLOWED_ORIGINS=https://<your-vercel-domain>` (comma-separated if several).
2. **Vercel** — add `VITE_LIVE_ORIGIN=https://<live-server-domain>` and redeploy. The presenter, admin live pages and `/play` phones then talk to the live server.

Without `VITE_LIVE_ORIGIN` everything stays on the same host, which is what `npm run dev` and a plain `npm start` deployment use.

## How data flows

- **Registrations** are written by the public form straight to `hackathon_registered_participants` / `pitchfest_registered_participants`; `firestore.rules` validates every new document. Admins can mark teams rejected, edit or delete them.
- **Admin pages** sign in with the organiser account (or a user listed in `admins/{uid}`, see `npm run grant-admin`) and subscribe live to Firestore. Who counts as an admin is decided on the server (`/api/admin/check`).
- **Live games** (Tech Word Rush) run on the server, signed in as the organiser from `.env` (`src/lib/server/admin-session.ts`). Every join, hint and guess is a Firestore transaction there (`src/lib/server/games/`), so players can't edit XP or read answers. Players get up to 3 guesses per word with no feedback; guesses are judged and XP paid when the host reveals the answer. Run `npm run test:games` for the scoring rules.

## Project layout

```
src/App.svelte, src/lib/*.svelte   Registration + check-in (from main)
src/lib/server/*.js                Confirmation email, QR and PDF pass (from main)
src/routes/(registration)/         Mounts main's app at / and /check-in/*
src/routes/admin/                  Organiser control center
src/routes/join/                   Code entry (games and live sessions) + game player screens
src/routes/play/                   Phone screens for live sessions
src/lib/live/                      Live sessions: data model, protocol, client stores, motion
src/lib/server/live/               Live hub (WebSocket), repository, admin token check
server.js                          Production entry: adapter-node handler + /live WebSocket
src/routes/api/                    Admin check, games, confirmation email
src/lib/games/                     Game rules, questions, client API
src/lib/server/games/              Server-side game logic
src/lib/components/                Admin, games, motion and UI components
firestore.rules                    Access boundaries
```

## Live sessions

Quizzes, polls, reactions and Q&A run live: organisers build a session in `/admin/live`, present it on a projector (`/admin/live/{id}/present`), and the audience joins from phones with a 6-digit code (typed at `/join`, which also takes game codes), QR or link — no account.

- **Real-time** runs over a WebSocket at `/live` (the `ws` package), served by the same Node process. In production start the app with `npm start` (runs `server.js`), not `node build` — the plain adapter-node entry has no WebSocket.
- **Run one server process.** Live room state (timer, answers, scores) is held in memory and written through to Firestore. Several instances would need a shared pub/sub layer.
- **The server is authoritative.** Admin HTTP calls and socket actions verify the organiser's Firebase ID token server-side (same rule as `isAdmin()` in `firestore.rules`). Correct answers never reach phones before the host reveals them.
- **Storage:** `liveQuizSessions/{id}` (slides embedded, in order), `liveQuizSessions/{id}/participants`, and `liveQuizJoinCodes/{code}` (reserves a code while a session is open). Without Admin SDK credentials the server falls back to an in-memory store — fine for local development, lost on restart.
- **Testing on phones locally:** `npm run dev -- --host`, then open the presenter via your computer's LAN address (not `localhost`) so the QR code points somewhere phones can reach.
- **Rehearsing before a deploy:** in `/admin/live` click **Demo session** (one slide of every type, ready to present), open **Present**, then fill the lobby with simulated phones: `npm run live:bots -- <join code> --players 10` (add `--url https://your-host` to test a deployed server). Bots answer every open slide with random answers.
- **Tests:** `npm test` (Vitest) — slide sanitising, profanity filter, and the socket hub end to end.

On Vercel, see **Live sessions on Vercel** above.
