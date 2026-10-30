# Tournaments

Any live game can be run as a tournament from **Admin → Games → Tournament → Create tournament**. The organiser picks the game, keeps the game's own setup (the same settings as a plain game), and adds tournament rules on top. Everyone registers once with one QR code; each stage is a real game of that type, run by its own presenter and its own rules; the top of each leaderboard goes through until the final decides the podium.

## Two shapes of tournament

Games differ in how many people can sensibly play one game, so there are two rule sets. The form shows which one a game uses.

| Format | Games | Rules the organiser sets | How a stage works |
| --- | --- | --- | --- |
| **Rooms & knockout** | Word Heist, Scribble Showdown | participants, stages (2–5), players per room, go through per room | Players are dealt into rooms (one game each); the top *N* of every room go through; the last stage is one final room. |
| **Elimination** | Tech Word Rush, Flappy Bird, Soar & Roar with Symba | participants, stages (2–5), players in the final | Everyone still in plays one game together on the big screen; the top of the leaderboard goes through. The cut after each stage is spread evenly in ratio, so every stage knocks out a similar share (100 → 32 → 10 for 3 stages and 10 finalists). |

Rooms rules use the same locked-box form as Word Heist: a box the organiser sets stays as set (× frees it), the others are worked out to fit, and clashing boxes are named rather than changed. Elimination refuses plans where a stage would knock nobody out. Both adapt to how many actually register: a small crowd plays fewer stages (straight to the final if need be).

### Where the engines live

- **Word Heist** keeps its own tournament engine on the live server (rooms, tile bags, ties decided by the organiser) — see [word-heist.md](word-heist.md). The Tournament module just opens it with Word Heist's full tournament form; the Word Heist card's **Start live game** now creates a single game only.
- **Every other game** is run by the generic tournament in `src/lib/server/games/tournament.ts`, described below.

## Running a generic tournament

1. **Registration.** Phones scan the QR (`/join/t/{code}`; the code `ZT····` also works at `/join`), enter a name once and get one device token for the whole tournament. Registration can be closed and reopened; it stops at the participant limit.
2. **Lock entries & make stage 1.** The plan is fitted to who registered. For each room a real game session is created with the tournament's settings (Tech Word Rush stages get a fresh random set from the bank, with no word repeated across the tournament) and every player is **seated** in it: the same player id and device-token hash are written into the game, so their phone is already on the list. Anyone registering afterwards joins the reserve list and does not play.
3. **Play the stage.** Each room's game is run from its own presenter (**Open presenter** on the dashboard), by that game's rules: Tech Word Rush reveals and moves on from the big screen, Flappy and Symba close at time-up, Scribble takes turns. The dashboard can start every room at once and end a room early. Scribble rooms are timed from a screen, so the dashboard keeps every room's clock going — keep it open while a Scribble stage plays. Nobody can join a room's game directly; it says to use the tournament QR instead.
4. **Finish the stage** (enabled once every room's game has finished and its scores are counted). Each room is ranked from its game's final leaderboard, in the game's own order with the game's own tie-breaks (XP then correct answers then join order; best flight then who reached it first; Scribble's ranking). Players a game removed for going offline finish last. The qualifiers are decided, their phones show *You advance!*, and the next stage's games are created straight away — dealt so last stage's winners are kept apart.
5. **The final** decides 1st to 3rd; the tournament moves to the Games page history with its winner.
6. **End tournament / Close lobby** ends it for good: any game still running is ended, phones go back to the home page.

Participants can be removed from the dashboard at any time: they stay in a game they are already in but cannot go through.

### The phone

`/join/t/{code}` shows registration, the lobby count, and when a stage is prepared, the player's room with a **Play now** button; it also takes them in on its own after a moment. Playing happens on the game's ordinary phone screen (`/join/{code}`, `/join/flap/{code}`, `/join/draw/{code}`), which shows a **Back to the tournament** link when the game ends. Then the tournament page shows the result: through, out (with the place in their room), finalist or champion, and the podium.

## Data model (`liveSessions/{code}`, gameType `tournament`)

| Path | Contents | Access |
| --- | --- | --- |
| `liveSessions/{code}` | game, format, rules, settings, status (`lobby` · `stage` · `finished`), plan, the current stage's rooms (game codes), podium | public get |
| `players/{id}` | name, status (`lobby` · `playing` · `qualified` · `eliminated` · `reserve` · `removed` · `finalist` · `champion`), stage, room, place, last rank and score | public get, admin list |
| `stages/{n}` | every room's ranking and who went through | organisers only |
| `playerState/{id}`, `names/*` | device-token hash, unique names | organisers only |

A room's game session is an ordinary `liveSessions/{code}` document of its game with a `tournament` tag (`{ code, game, stage, totalStages, room, rooms, final }`). The Games page lists tournaments and hides their rooms; **Clear all** in the history removes finished tournaments and their finished rooms.

Everything runs through the server signed in as the organiser from `.env` (`src/lib/server/admin-session.ts`), like the games themselves, so a Vercel deployment needs nothing new. Endpoints: `POST /api/games/tournament/sessions` (create), `…/{code}/join`, `…/{code}/play` (a phone checking it is still in), `…/{code}/control` (organiser actions).

## Files

| Layer | Files |
| --- | --- |
| Rules, plans, results (pure, tested) | `src/lib/games/tournament/plan.ts`, `types.ts`, `plan.test.ts` |
| Browser calls, seating a phone into a room | `src/lib/games/tournament/api.ts` |
| Server: create, join, lock, finish stage, close | `src/lib/server/games/tournament.ts` |
| Seating players into a game (per game) | `seedTournament` in `src/lib/server/games/{tech-word-rush,flappy,scribble}.ts` |
| Setup forms shared with the Start dialog | `src/lib/components/games/setup/*.svelte` |
| Dashboard | `src/routes/admin/games/tournament/live/[code]` |
| Phone | `src/routes/join/t/[code]` |

`npm test` covers the planner (elimination cuts, shortened tournaments, rooms limits, rule parsing, rankings from leaderboards, qualifier order).
