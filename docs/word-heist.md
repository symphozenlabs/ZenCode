# Word Heist

A real-time, multi-room word-stealing tournament (inspired by Merriam-Webster's Pilfer). Everyone scans one QR code; the server makes rooms of about ten, players build and steal words, and the top two in each room advance until a single room plays the final.

## Running a tournament

1. **Admin → Games → Word Heist → Start live game.** Choose the round length and word-length limits. This opens the tournament dashboard with the join QR code (`/join/heist/{code}`; the code `ZH····` also works at `/join`).
2. **Registration.** Players enter a display name (unique per tournament). Each sees a *provisional* room that can change as more people join; they are told when it does.
3. **Review rooms → Lock rooms.** The dashboard shows the allocation (e.g. "10 rooms × 10, 5 rooms × 9"). Locking deals three starter words to everyone and fixes the rooms. Anyone who registers afterwards joins the **reserve list** and does not play.
4. **Start round.** Every room runs on one shared timer. Pause/Resume and End round apply to all rooms. When the timer reaches zero the server ends the round itself, even if no dashboard is open.
5. **Results.** Each room is ranked; the top two qualify. If players are level on every tie-break across the cutoff, the dashboard asks you to pick who advances (click them in place order, then confirm). Nobody is dropped silently.
6. **Prepare next round.** Qualifiers are re-allocated with the same policy, with fresh starter words and scores. The round with a single room is the final; it decides 1st–3rd (ties for a podium place are decided the same way).
7. **Reset** (type the code to confirm) deletes all rooms, boards and results and returns every participant to the lobby. Finished tournaments can be cleared from the Games page history.

Participants can be removed from the dashboard (participant list or room detail). In a running round their words leave the board and they drop out of the ranking.

## Rules

- **Make** a new word: dictionary word, from the minimum length (default 3) up to the *longest new word* (default 5). The cap keeps typing long words from out-scoring stealing.
- **Steal / extend**: pick a word on the board and enter a new word that keeps **every** letter of it (repeats counted), in any order, plus at least one more letter. Stealing your own word ("extend") is allowed.
- Rejected: words not in the dictionary, blocked words, words already on the board in that room, a source word that has just changed hands, and **plural-only** changes (CAT → CATS, BOX → BOXES, BERRY → BERRIES). Plurals are detected from the source word's regular plural spellings *and* the dictionary — not by banning words ending in S, so CAT → ACTS is fine.
- **Score** = total letters in the words a player currently holds. A steal moves the old word's points away from its owner and gives the new word's points to the thief, in the same write. Failed moves score nothing.
- **Starter words**: one 3-, one 4- and one 5-letter common word each (12 points for everyone), no repeats in a room, randomised per room from a server-held seed.
- **Ranking / tie-breaks** (in order): score → longest word held → successful steals → who reached their score first. Players equal on all four share a rank and, at a cutoff, are decided by an organiser.

## Room allocation

`src/lib/games/word-heist/allocation.ts` (pure, unit-tested). For N participants with r = N mod 10:

| Case | Rooms |
| --- | --- |
| N = 0 | none |
| r = 0 | N / 10 |
| r = 5–9 | ceil(N / 10) |
| r = 1–4 | ceil(N / 11) |

Participants are then spread as evenly as possible (sizes differ by at most one; hard limit 20, in practice ≤ 11), dealt round-robin from the ordered roster — registration order in round 1, last round's 1st places then 2nd places afterwards, so winners are kept apart.

Examples: 160 → 16 × 10 · 145 → 10 × 10 + 5 × 9 · 143 → 13 × 11 · 146 → 11 × 10 + 4 × 9 · 134 → 4 × 11 + 9 × 10.

## Architecture

Word Heist runs on the **live server** (`server.js`), the same long-running Node process that hosts live sessions. The tournament — players, rooms, boards, scores, results — is held in that process's memory. Phones and the organiser dashboard each keep one WebSocket open to it at `/heist`:

```
phone ──move──▶ live server: check dictionary, moderation and steal rules,
                apply to the room's board (one synchronous step)
       ◀─verdict── and the new board is pushed to everyone in that room
                     │ every 2 s, only what changed
                     ▼
                 Firestore (backup + the admin Games list)
```

Measured with 200 bot phones on one machine (`npm run heist:bots`): a move's verdict comes back in **~5 ms** (p95 ~15 ms) and reaches the other phones in the room within the same few milliseconds; 4,500 moves, no dropped connections. Real phones add their own network round trip to the live server.

| Layer | Files |
| --- | --- |
| Rules (pure) | `src/lib/games/word-heist/engine.ts` — letters, plurals, moves, scoring, ranking, ties, starter dealing |
| Allocation (pure) | `src/lib/games/word-heist/allocation.ts` |
| Types / socket protocol | `src/lib/games/word-heist/types.ts`, `protocol.ts` |
| Browser connection | `src/lib/games/word-heist/client.svelte.ts` (reconnecting socket, shared with live sessions' `LiveSocket`) |
| Tournament (in memory) | `src/lib/server/games/word-heist/tournament.ts` |
| Socket hub | `src/lib/server/games/word-heist/hub.ts` (wired in `hooks.server.ts`, `server.js`, `vite.config.ts`) |
| Saving / restoring | `src/lib/server/games/word-heist/store.ts` |
| Dictionary, moderation, rules | `dictionary.ts`, `moderation.ts`, `service.ts` |
| Endpoints | `POST /api/live/heist` (create, organiser), `/api/games/word-heist/moderation` |
| Player screen | `src/routes/join/heist/[code]/+page.svelte` |
| Admin | `src/routes/admin/games/word-heist/live/[code]`, `…/moderation` |

### Why no transactions

Node runs one piece of code at a time, and a move is checked and applied in one synchronous step (`Tournament.move`). Nothing can change the board between the check and the change, so two players stealing the same word can't both win — the second finds it gone ("That word just changed hands"). This holds with **one** server process, which is already the rule for live sessions (`render.yaml`: `numInstances: 1`).

- **Idempotency**: each move carries a request id kept on the board (last 300); a re-sent move (for example after a reconnect) gets its first verdict back and is never counted twice — also after a server restart.
- **Organiser actions** run one at a time and check the current status, so a double click does nothing.
- **Rate limits**: 20 messages/s per socket, 5 moves per 2 s per player, 5 join attempts per socket.
- **Round timer** runs on the server: rounds end on time with no dashboard open.

### Saving and restarts

Every 2 s the tournament writes whatever changed (boards, room summaries, players, tournament status) in **one batch** — no reads or transactions per move, and at most one batch every 2 s however busy it gets. Joins are saved before the phone is told it joined (so its device token survives a restart); organiser actions and round results are saved straight away.

After a restart (deploy or crash) the first phone or dashboard that reconnects loads the tournament back from Firestore; a running round keeps its deadline and its timer is re-armed (tested by hard-killing `server.js` mid-round). At most the last ~2 s of moves can be lost in a crash; a clean shutdown (`SIGTERM`) saves first.

### Data model (`liveSessions/{code}`, gameType `word-heist`)

| Path | Contents | Access |
| --- | --- | --- |
| `liveSessions/{code}` | status, rules, round, timer, podium (the admin Games list reads it) | public get |
| `players/{id}` | name, status, current room, place | public get, admin list |
| `rooms/{roomId}`, `boards/{roomId}`, `rounds/{n}` | saved room summaries, boards, results | organisers only |
| `playerState/{id}`, `secret/heist` | device-token hash, seed for room ids and starters | organisers only |
| `gameConfig/wordHeist` | event blocklist + obfuscation setting | organisers only |

The server signs in to Firestore as the organiser from `.env` (no service account needed).

## Moderation

Two independent layers on every new and stolen word, both on the server:

1. The site's general profanity filter (`src/lib/server/live/profanity.ts`, also used for nicknames).
2. The **event blocklist**, edited at `/admin/games/word-heist/moderation` and stored in `gameConfig/wordHeist`. It starts as `slut, sex, porn, gay, inner, bra` — event policy, not a judgement on the words. Entries match whole words and their -s/-es/-ed/-ing forms (BRA blocks BRAS, not BRAIN; INNER does not block WINNER). An entry ending in `*` blocks every word starting with it.

With *Detect disguised words* on, look-alike characters and separators in the raw input (`s3x`, `s-e-x`) are undone and screened. Words must be A–Z dictionary words, which rules out most disguises anyway. Limits: no filter is complete; the general filter can block ordinary words that double as slang (COCK, ASS); prefix entries can catch legitimate words — use the tester on the moderation page. Rejected words are not logged.

## Dictionary

SCOWL (sizes 10–60, dialect-neutral + American + British, ~79k plain a–z words) from the `wordlist-english` package; SCOWL is © Kevin Atkinson and contributors under a permissive licence (see `node_modules/wordlist-english/Copyright`). Starter words come from sizes 10–20 only. The lists are bundled into the server build (~1 MB) and never sent to browsers.

## Deployment

1. **Word Heist needs the live server.** Vercel can't hold WebSockets, so — exactly as for live sessions — run `server.js` on a Node host (Render via `render.yaml`, Railway, a VM), set `VITE_LIVE_ORIGIN=https://<live server>` on Vercel, and `LIVE_ALLOWED_ORIGINS=https://<vercel site>` on the live server. Locally, `npm run dev` and `npm start` already serve `/heist`.
2. **One instance only**, and keep it awake on event days (Render's free plan sleeps after 15 minutes idle — use the Starter plan).
3. **Publish `firestore.rules`** (`firebase deploy --only firestore:rules`): rules for `liveSessions/{code}/rooms|boards|rounds` and `gameConfig/{id}`.
4. Environment: the live server needs `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `VITE_FIREBASE_*` (already listed in `render.yaml`). No new variables.

## Tests

- `npm test` — unit tests: allocation (every N to 1000, required examples), engine (letters, plurals, scoring, ownership, duplicates, idempotency, ranking, cutoff ties, final podium, 145-player progression, starter dealing), moderation, the real dictionary, and the in-memory tournament (`tournament.test.ts`: joins, provisional rooms, starters, moves pushed only to their room, the same word taken once, duplicate requests, the server-side timer, pause/resume, ties, next round, final podium, removal, reset, batched saving, and restoring a running round after a restart).
- `npm run heist:bots -- --auto --bots 200 [--seconds 60] [--url …]` — 200 bot phones, each with its own WebSocket, play a full tournament against a running server and real Firebase; the script creates the tournament and drives every round as organiser (or pass a `ZH····` code and run it yourself from the dashboard). It reports verdict and room-broadcast latency and dropped connections, then checks the results the server saved to Firestore.

## Known limitations

- One live-server process only (the in-memory design); a crash can lose the last ~2 s of moves.
- Reserves don't enter later rounds (later rounds are qualifier-only).
- English A–Z only.
- Latency was measured on one machine; the network between phones and the live server adds its own delay — rehearse on the real host.
