# ZenCode

ZEN CODE 2026 — Hackathon & Pitch Fest registration, plus an organiser control center and live games.

Built with SvelteKit (Svelte 5) on Vercel, Firebase Authentication (organisers only), Cloud Firestore and Resend.

## Experiences

| Area | Routes | Access |
| --- | --- | --- |
| Registration (from `main`) | `/`, `/check-in/{teamId}`, `/api/registration/send-confirmation` | Anyone |
| Admin | `/admin/login`, `/admin`, `/admin/hackathon`, `/admin/pitch-fest`, `/admin/settings`, `/admin/games` | Organisers |
| Live games | `/join`, `/join/{code}` (players, no account) · `/admin/games/tech-word-rush/live/{code}` (presenter) | Players / organisers |

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
src/routes/join/                   Player screens for live games
src/routes/api/                    Admin check, games, confirmation email
src/lib/games/                     Game rules, questions, client API
src/lib/server/games/              Server-side game logic
src/lib/components/                Admin, games, motion and UI components
firestore.rules                    Access boundaries
```
