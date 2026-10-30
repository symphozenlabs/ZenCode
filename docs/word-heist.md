# Word Heist

A real-time word-stealing game (inspired by Merriam-Webster's Pilfer), run either as a **game** — one room of up to 12 — or as a **tournament** of stages: everyone scans one QR code, the server splits them into rooms of at most 12, and the top players of each room go through until a single room plays the final.

## Creating a lobby

**Admin → Games → Word Heist → Start live game** creates a **game**: one room, one round, 2–15 players (you choose the limit). The top three make the podium.

**Admin → Games → Tournament → Create tournament → Word Heist** creates a **tournament** (see also [tournaments.md](tournaments.md) for the other games): set **participants**, **stages** (2–5, the final included), **players per room** (2–15, default 12) and **go through per room**:
  - **Whatever you set stays as you set it** (the box is highlighted; its × frees it again). Only the boxes you haven't set are worked out, changing as few as possible: free participants become the most the plan takes (going up or down with stages, room size and players going through); with participants set, the stages, room size or players going through that you left free are chosen to fit them.
  - If the boxes you set can't work together, nothing is changed and the form says which ones clash and why (e.g. "1000 participants, 2 stages and rooms of 12 can't work together…").
  - The form lists every stage (players, rooms, how many go through) and refuses plans that can't work, saying why.

Both share the timing and **Shortest word**. **Round length** is a dropdown (1–10 minutes): how long tiles keep dropping. You set it and **Tiles per room** (for a full room: 10 up to 300 for a 1-minute round, rising evenly to 3000 for 20 minutes — e.g. 870 for 5, 1580 for 10); **New tile every** is read-only, worked out as round length ÷ (tiles − 3), and must come out between 0.1 and 30 s. The **Final countdown** (none, 10–60 s, default 30) is a separate setting that runs after the last tile, with no new tiles, so a round lasts round length + countdown. Tiles you set stay highlighted (× to free them); not set, they're suggested for the room size and round length. If the tiles can't fit (faster than one every 0.1 s, or slower than one every 30 s), the form says how many would. This opens the dashboard with the join QR code (`/join/heist/{code}`; the code `ZH····` also works at `/join`).

## Running it

1. **Registration.** Players enter a display name (unique per lobby). Each sees a *provisional* room that can change as more people join. Registration stops at the participant limit.
2. **Review rooms → Lock rooms.** The dashboard shows the rooms and stages. Locking fixes the rooms and gives each its own shuffled bag of tiles; everyone starts on 0. Anyone who registers afterwards joins the **reserve list** and does not play. If fewer people came than planned, the tournament plays fewer stages (a small crowd goes straight to the final).
3. **Start round.** Every room runs on one shared clock of the length you chose: three tiles turn over at once, then the rest drop evenly; the last 30 s have no new tiles. Pause/Resume (tiles stop too) and End round apply to all rooms. The server runs the clock and ends the round itself, even if no dashboard is open.
4. **Results.** Each room is ranked; the top *go through per room* qualify. If players are level on every tie-break across the cutoff, the dashboard asks you to pick who advances (click them in place order, then confirm). Nobody is dropped silently.
5. **Prepare next stage.** Qualifiers are re-allocated, everyone back on 0 with fresh bags. The last stage is a single room, the final; it decides 1st–3rd (ties for a podium place are decided the same way).
6. **Close lobby / End tournament** (confirm) ends it for good: registration closes, a running round stops without scoring, players' phones go back to the home page, the organiser goes back to the Games page, and it moves to the Games page history.
7. **Reset** (type the code to confirm) deletes all rooms, boards and results and returns every participant to the lobby. Finished games can be cleared from the Games page history.

Participants can be removed from the dashboard (participant list or room detail). In a running round their words leave the board and they drop out of the ranking.

## Rules

Modelled on Merriam-Webster's Pilfer. Players type a word and press enter — they never pick a word first; the server works out what the word is.

- **Tiles**: each room has its own bag in roughly English letter proportions (~40% vowels), shuffled from a server-held seed. Tiles drop face up into a row the whole room shares. The bag is never sent to phones.
- **Tiles follow the room size by band** (2–5, 6–10, 11–15 players): the organiser's bag goes to the full room's band and each band below gets an equal step less — 150 set for rooms of up to 15 (or 12) gives 150 / 100 / 50; set for up to 10 (or 9) gives 150 / 75. Every room's tiles are spread evenly over the same round length, then the final countdown. Rooms of different sizes drop at their own pace but end together. The suggested bag (used when none is given) is 20 + 10 per player at one tile every 1.5–8 s; changing the room size rescales the tiles unless the organiser set them.
- **Make** a word (default 3+ letters) from the face-up tiles only. The tiles used leave the row. A word whose letters aren't there is refused ("Letters not available") — players can't just type any word.
- **Steal**: a new word that keeps **every** letter of a word on the board (repeats counted, any order) plus **at least one tile** from the row. Your own words can be extended the same way. When a word could be made more than one way, a steal wins over making it from tiles, another player's word over your own, longer words first.
- The one exception (Pilfer's): just adding S to the end doesn't steal (PAT → PATS); using the S to rearrange does (PAT → PAST, TAPS). A word made purely from tiles is always fine.
- Also rejected: words not in the dictionary, blocked words, words already on the board in that room, and only rearranging a word without adding a tile (CARE → RACE).
- **Score** = total letters in the words a player currently holds; everyone starts on 0. A steal moves the old word's points away from its owner and gives the new word's points to the thief, in the same step. Extending your own word gains only the new letters. Failed moves score nothing.
- **Ranking / tie-breaks** (in order): score → longest word made this round → who made it first. Players equal on all three share a rank and, at a cutoff, are decided by an organiser.

## Rooms and stages

`src/lib/games/word-heist/allocation.ts` (pure, unit-tested):

- A stage before the final uses the fewest rooms of at most the chosen room size (default 12) (never fewer than two), sizes differing by at most one; the top *A* of each room go through, so the next stage has rooms × *A* players. Every such room needs more than *A* players.
- The last stage is one room of at most that size.
- **Most participants** for *S* stages and *A* through: 12 for the final, then for each earlier stage 12 × ⌊previous ÷ *A*⌋ (capped at 1000). E.g. 2 stages, 2 through → 72; 3 stages, 2 through → 432.
- **Automatic go-through** for *N* participants and *S* stages: the largest *A* whose plan works. E.g. 100 players, 3 stages → 4 through: 9 rooms → 36 → 3 rooms → 12 in the final.
- Players are dealt round-robin from the ordered roster — registration order in stage 1, then last stage's 1st places, 2nd places and so on — so winners are kept apart.

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
| Rules (pure) | `src/lib/games/word-heist/engine.ts` — tile bags, the round clock, moves (make / steal), scoring, ranking, ties |
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
- **Tile clock** runs on the server: it turns over each tile in every room and ends the round on time with no dashboard open. A move also turns over any tile that is due, so a tile is never late by more than the clock's ~20 ms slack.

### Saving and restarts

Every 2 s the tournament writes whatever changed (boards, room summaries, players, tournament status) in **one batch** — no reads or transactions per move, and at most one batch every 2 s however busy it gets. Joins are saved before the phone is told it joined (so its device token survives a restart); organiser actions and round results are saved straight away.

After a restart (deploy or crash) the first phone or dashboard that reconnects loads the tournament back from Firestore; a running round keeps its deadline and bag, and its tile clock is re-armed (tested by hard-killing `server.js` mid-round). At most the last ~2 s of moves can be lost in a crash; a clean shutdown (`SIGTERM`) saves first.

### Data model (`liveSessions/{code}`, gameType `word-heist`)

| Path | Contents | Access |
| --- | --- | --- |
| `liveSessions/{code}` | status, rules, round, timer, podium (the admin Games list reads it) | public get |
| `players/{id}` | name, status, current room, place | public get, admin list |
| `rooms/{roomId}`, `boards/{roomId}`, `rounds/{n}` | saved room summaries, boards, results | organisers only |
| `playerState/{id}`, `secret/heist` | device-token hash, seed for room ids and tile bags | organisers only |
| `gameConfig/wordHeist` | event blocklist + obfuscation setting | organisers only |

The server signs in to Firestore as the organiser from `.env` (no service account needed).

## Moderation

Two independent layers on every new and stolen word, both on the server:

1. The site's general profanity filter (`src/lib/server/live/profanity.ts`, also used for nicknames).
2. The **event blocklist**, edited at `/admin/games/word-heist/moderation` and stored in `gameConfig/wordHeist`. It starts as `slut, sex, porn, gay, inner, bra` — event policy, not a judgement on the words. Entries match whole words and their -s/-es/-ed/-ing forms (BRA blocks BRAS, not BRAIN; INNER does not block WINNER). An entry ending in `*` blocks every word starting with it.

With *Detect disguised words* on, look-alike characters and separators in the raw input (`s3x`, `s-e-x`) are undone and screened. Words must be A–Z dictionary words, which rules out most disguises anyway. Limits: no filter is complete; the general filter can block ordinary words that double as slang (COCK, ASS); prefix entries can catch legitimate words — use the tester on the moderation page. Rejected words are not logged.

## Dictionary

SCOWL (sizes 10–60, dialect-neutral + American + British, ~79k plain a–z words) from the `wordlist-english` package; SCOWL is © Kevin Atkinson and contributors under a permissive licence (see `node_modules/wordlist-english/Copyright`). The lists are bundled into the server build (~1 MB) and never sent to browsers.

## Deployment

1. **Word Heist needs the live server.** Vercel can't hold WebSockets, so — exactly as for live sessions — run `server.js` on a Node host (Render via `render.yaml`, Railway, a VM), set `VITE_LIVE_ORIGIN=https://<live server>` on Vercel, and `LIVE_ALLOWED_ORIGINS=https://<vercel site>` on the live server. Locally, `npm run dev` and `npm start` already serve `/heist`.
2. **One instance only**, and keep it awake on event days (Render's free plan sleeps after 15 minutes idle — use the Starter plan).
3. **Publish `firestore.rules`** (`firebase deploy --only firestore:rules`): rules for `liveSessions/{code}/rooms|boards|rounds` and `gameConfig/{id}`.
4. Environment: the live server needs `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `VITE_FIREBASE_*` (already listed in `render.yaml`). No new variables.

## Tests

- `npm test` — unit tests: allocation (stage plans, most participants, automatic go-through, fewer stages for a small crowd), engine (tile bags, tiles per room size, the round clock, making words only from tiles, steals that must add a tile, the +S rule, steal preference, scoring, ownership, duplicates, idempotency, ranking, cutoff ties, final podium, any number going through, a 145-player 3-stage tournament), moderation, the real dictionary (Pilfer's own examples), and the in-memory tournament (`tournament.test.ts`: joins, the participant limit, a 12-player game, chosen stages and numbers going through, rooms of different sizes at their own pace, provisional rooms, everyone on 0, opening tiles, the bag never reaching phones, moves pushed only to their room, the same word taken once, duplicate requests, the server tile clock and the 30 s finish, pause freezing tiles, ties, next round, final podium, removal, closing the lobby, reset, batched saving, and restoring a running round after a restart).
- `npm run heist:bots -- --auto --bots 200 [--seconds 60] [--url …]` — 200 bot phones, each with its own WebSocket, play a full tournament against a running server and real Firebase; the script creates a quick tournament (2-minute rounds, 3 stages, 2 through) and drives every round as organiser (or pass a `ZH····` code and run it yourself from the dashboard). Bots only play the face-up tiles, as players must; rounds end on their own, or after `--seconds`. It reports verdict and room-broadcast latency and dropped connections, then checks the results the server saved to Firestore.

## Known limitations

- One live-server process only (the in-memory design); a crash can lose the last ~2 s of moves.
- Reserves don't enter later rounds (later rounds are qualifier-only).
- English A–Z only.
- Latency was measured on one machine; the network between phones and the live server adds its own delay — rehearse on the real host.
