# ZenCode

Event platform for ZenCode — **Code. Create. Compete.** Public website with Hackathon and Pitch Fest registration, plus an organiser control center.

Built with SvelteKit (Svelte 5), Tailwind CSS v4, Firebase Authentication (organisers only) and Cloud Firestore.

## Experiences

| Area | Routes | Access |
| --- | --- | --- |
| Public site | `/`, `/hackathon`, `/pitch-fest`, `/schedule`, `/rules`, `/register` | Anyone |
| Admin | `/admin/login`, `/admin`, `/admin/hackathon`, `/admin/pitch-fest`, `/admin/settings`, `/admin/live` | Organisers (Firebase Auth + `admins/{uid}`) |
| Live sessions (phones) | `/join`, `/play/{code}` | Anyone with the join code |

Participants never create accounts — registering only records the team.

## Setup

1. Create a Firebase project with **Authentication (Email/Password)** and **Cloud Firestore** enabled.
2. Copy `.env.example` to `.env` and fill in `PUBLIC_FIREBASE_*` (the web app config). Admin SDK credentials are optional.
3. Deploy the security rules: `firebase deploy --only firestore:rules`
4. Create an organiser user in the Firebase console (Authentication → Users), then grant access:
   ```sh
   npm run grant-admin -- organiser@example.com
   ```
5. Run it:
   ```sh
   npm install
   npm run dev
   ```

## How data flows

- **Registrations** come from the `/register` page (Hackathon: teams of 3–4, Pitch Fest: teams of 2). The form writes straight to Firestore — `hackathon_registered_participants` or `pitchfest_registered_participants` — after checking for duplicate admission numbers and emails. Each team document holds `teamLeader`, `members` (leader is member 1), `teamSize`, `status` (`pending` → `approved`/`rejected`) and `registeredAt`. `firestore.rules` validates every new document and lets only admins update or delete.
- **Event content** (dates, venue, tracks, prizes, schedule, rules, sponsors) lives in `config/site`. The public site reads it server-side, cached for 30 seconds. Admins edit it in `/admin/settings` and on each event page's *Event settings* tab. Every fact defaults to empty and shows as "To be announced" — nothing is hard-coded.
- **Admin pages** are client-rendered and subscribe live to Firestore, so new registrations and status changes appear without a refresh.

## Project layout

```
src/lib/config/site.ts            Site config types + empty defaults
src/lib/registrations/model.ts    Collections, team sizes and the registration shape
src/lib/components/registration/  Public Hackathon / Pitch Fest registration forms
src/lib/server/                   Admin SDK, config loader, rate limiter
src/lib/stores/                   Admin auth, live registrations, live config
src/lib/components/motion/        AnimatedGrid, GlowBackground, NoiseOverlay, FloatingShapes, GradientOrb, ParticleField, Spotlight
src/lib/components/ui/            Buttons, fields, badges, modal, states
src/lib/components/site/          Public header, footer, hero, event page
src/lib/components/admin/         Shell, tables, editors
src/lib/live/                     Live sessions: data model, protocol, client stores, motion
src/lib/server/live/              Live hub (WebSocket), repository, admin token check, profanity filter
src/lib/components/live/          Builder, presenter and phone components
server.js                         Production entry: adapter-node handler + /live WebSocket
firestore.rules                   Access boundaries
```

## Live sessions

Quizzes, polls, reactions and Q&A run live: organisers build a session in `/admin/live`, present it on a projector (`/admin/live/{id}/present`), and the audience joins from phones with a 6-digit code, QR or link — no account.

- **Real-time** runs over a WebSocket at `/live` (the `ws` package), served by the same Node process. In production start the app with `npm start` (runs `server.js`), not `node build` — the plain adapter-node entry has no WebSocket.
- **Run one server process.** Live room state (timer, answers, scores) is held in memory and written through to Firestore. Several instances would need a shared pub/sub layer.
- **The server is authoritative.** Admin HTTP calls and socket actions verify the organiser's Firebase ID token server-side (same rule as `isAdmin()` in `firestore.rules`). Correct answers never reach phones before the host reveals them.
- **Storage:** `liveSessions/{id}` (slides embedded, in order), `liveSessions/{id}/participants`, and `liveJoinCodes/{code}` (reserves a code while a session is open). Without Admin SDK credentials the server falls back to an in-memory store — fine for local development, lost on restart.
- **Testing on phones locally:** `npm run dev -- --host`, then open the presenter via your computer's LAN address (not `localhost`) so the QR code points somewhere phones can reach.
- **Rehearsing before a deploy:** in `/admin/live` click **Demo session** (one slide of every type, ready to present), open **Present**, then fill the lobby with simulated phones: `npm run live:bots -- <join code> --players 10` (add `--url https://your-host` to test a deployed server). Bots answer every open slide with random answers.
- **Tests:** `npm test` (Vitest) — slide sanitising, profanity filter, and the socket hub end to end.
