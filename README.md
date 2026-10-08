# ZenCode

Event platform for ZenCode — **Code. Create. Compete.** Public website with Hackathon and Pitch Fest registration, plus an organiser control center.

Built with SvelteKit (Svelte 5), Tailwind CSS v4, Firebase Authentication (organisers only) and Cloud Firestore.

## Experiences

| Area | Routes | Access |
| --- | --- | --- |
| Public site | `/`, `/hackathon`, `/pitch-fest`, `/schedule`, `/rules`, `/register` | Anyone |
| Admin | `/admin/login`, `/admin`, `/admin/hackathon`, `/admin/pitch-fest`, `/admin/settings` | Organisers (Firebase Auth + `admins/{uid}`) |

Participants never create accounts. Registering produces a reference ID (`ZC-XXXXXX`), not a login.

## Setup

1. Create a Firebase project with **Authentication (Email/Password)** and **Cloud Firestore** enabled.
2. Copy `.env.example` to `.env` and fill in:
   - `PUBLIC_FIREBASE_*` — the web app config.
   - Admin SDK credentials — a service account (`FIREBASE_SERVICE_ACCOUNT` as one-line JSON, or the three individual fields).
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

- **Registrations** are submitted to `POST /api/register`, which validates input, checks the event is open (deadline, capacity, duplicate email) and writes with the Admin SDK. Clients can't create, read or list registrations directly — the Firestore rules allow reads and updates only for admins.
- **Event content** (dates, venue, tracks, prizes, schedule, rules, sponsors) lives in `config/site`. The public site reads it server-side, cached for 30 seconds. Admins edit it in `/admin/settings` and on each event page's *Event settings* tab. Every fact defaults to empty and shows as "To be announced" — nothing is hard-coded.
- **Admin pages** are client-rendered and subscribe live to Firestore, so new registrations and status changes appear without a refresh.

## Project layout

```
src/lib/config/site.ts            Site config types + empty defaults
src/lib/validation/registration.ts Shared client/server validation
src/lib/server/                   Admin SDK, config loader, rate limiter
src/lib/stores/                   Admin auth, live registrations, live config
src/lib/components/motion/        AnimatedGrid, GlowBackground, NoiseOverlay, FloatingShapes, GradientOrb, ParticleField, Spotlight
src/lib/components/ui/            Buttons, fields, badges, modal, states
src/lib/components/site/          Public header, footer, hero, event page
src/lib/components/admin/         Shell, tables, editors
firestore.rules                   Access boundaries
```

## Not yet built

The live Tech Quiz, Ice Breaker games, QR join flow and presenter view are out of scope for this pass.
