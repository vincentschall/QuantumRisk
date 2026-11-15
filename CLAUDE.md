# QuantumRisk

A **digital** territorial-conquest game for **2–4 players** in about **30 minutes**, on a small map
shaped like a **computer mainboard**. It is inspired by classic dice-based conquest games, but
**combat is deterministic and quantum superposition is the only source of uncertainty**. Players
put troops into a 50/50 superposition across two sectors, and an attack *measures* them. The
measurements come from quantum circuits run on the **Moth Quantum platform**. The game will be
browser-hosted on its own domain.

**Source of truth:** `RULEBOOK.md` defines the rules, and `src/engine/config.ts` (`DEFAULT_CONFIG`)
must match it exactly. When a rule changes, update the rulebook, the engine defaults and the tests
together.

## Design principles

1. **Deterministic battles.** No dice. With the same troops, a battle always has the same result.
2. **Quantum is the only randomness in play.** Every in-game uncertainty is a measurement. Only
   setup and card shuffles use an ordinary RNG.
3. **Superposition is honest.** Nobody knows where a stack is, not even its owner, until it is
   measured.
4. **Plain-language quantum.** The rules teach superposition and measurement correctly, without
   jargon. Every quantum rule maps to a real circuit: split = Hadamard gate, collapse = measurement.
5. **Short and tight.** 30 minutes, 2–4 players, a small map.
6. **Simple first.** Superposition and measurement only. Entanglement and similar mechanics are
   expansions, and only come after superposition is proven in playtests.
7. **Original IP.** Own map with generic component names (no hardware brands), own wording, and no
   trademarked names, art or text.
8. **English only. No factions, minimal lore:** players are plain colours with ordinary troops. The
   only story is the short setting at the start of the tutorial (commanders fighting over a
   mainboard). Sector cards show particles (proton / neutron / electron, photon = wild), and card
   texts carry real physics facts instead of lore.

## Settled decisions not visible in the rules

- **Rejected, don't re-propose without new evidence:**
  - quantum-themed missions,
  - single-card trades,
  - card escalation (it didn't shorten games and caused huge late swings),
  - the bluff reward (a card when an enemy attack on your stack fails),
  - splitting in the Quantum phase (splitting there was a net disadvantage).
- **Balance evidence** for the current numbers is in `design/balance.md`.
- **Variant candidates:**
  - Quantum strike: attack from a branch, measured first.
  - Entangled stacks: two stacks that collapse in opposite directions. These need a 2-qubit Bell
    circuit. Comet can't provide one (its output is independent bits by design); `graph-v1` or our
    own engine could.

## Quantum backend (Moth Quantum)

Docs: https://docs.mothquantum.com/docs/intro · API: `https://api.mothquantum.com/api/v1`

- **Auth:** `Authorization: Bearer <MOTH_API_KEY>`.
  - The key is in `.env`, which is gitignored; `.env.example` is the template.
  - The key is server-side only: never log it, commit it or send it to the browser.
- **Model:** you run named engines, not raw circuits. Creating our own engine is possible
  (`POST /engines`) but unexplored.
  - Submit: `POST /engines/{id}/process` with `{"params": {...}}`, which returns 202 with a `job_id`.
  - Poll: `GET /jobs/{id}/status`.
  - Fetch: `GET /jobs/{id}/result`. This returns 409 while the job is pending and 410 once the
    result has expired.
- **`comet-qrng-v1`** (the default source): 20 qubits in |+⟩ (Hadamard each), 10,000 shots, then
  an entropy check and a Toeplitz extractor.
  - One job costs 5 credits and returns up to 65,536 bits (emu) or about 45,000 (QPU). A game uses
    about 5–50.
  - On a QPU the result has grade `hardware-accounted` and a CHSH Bell witness (`ibm_fez`: S ≈ 2.58).
    Emu output is `simulator-baseline`.
  - The certificate fields are under `result.output.entropy_report`.
- **`coin-toss-v1`:** literally 1 qubit, H, measure. Counts only, so one bit needs one job with
  `shots: 1` (2 credits). `CoinTossProvider` exists, but it isn't the default.
- **Latency and limits:**
  - `emu` takes about 7 s per job. `qpu` on `ibm_fez` took 23 s, but hardware queues can take hours.
  - Long-poll with `GET /jobs/{id}/status?wait=10s`. 300 requests/min per key.
- **Measurement source:** hybrid, in this order:
  1. The pool of pre-fetched QPU bits (`quantum-pool/pool.json`, gitignored, filled with
     `npm run moth -- fill`).
  2. A live `emu` job.
  3. Local Web Crypto.
  - Every bit is used exactly once. Each measurement is logged with its source (e.g.
    `moth-qpu:ibm_fez`).
  - The engine is synchronous, so `QuantumSource` buffers bits ahead and refills in the background.
    Keep one source per server process, not one per game.

## Stack and hosting

- **Server-authoritative.** The game server runs the engine and Moth. Each browser only receives
  what its seats may see (no other players' cards, missions or drawn Quantum cards; never the
  measurement bits). Hot-seat uses the same server with several seats in one browser.
- **Live games only.** Rooms are joined by link with a nickname; no accounts. Empty seats can be
  bots (the `quantum` bot, the strongest in round-robin tests). Games live in memory and expire
  after 6 idle hours.
- **Desktop browsers only.** Small or touch screens get a "playable on desktop" notice.
- **Web client:** React + Vite, board drawn as SVG from `design/map.yaml` (positions included), served by
  GitHub Pages at `vincentschall.com/quantumrisk/` (`.github/workflows/pages.yml`).
- **Game server:** Node + `ws` on a Strato VPS (VPS S, Ubuntu LTS) at `play.vincentschall.com`,
  behind Caddy for HTTPS. `ALLOWED_ORIGINS` restricts which sites may connect.

## Code

- **Language:** TypeScript.
  - `npm run dev`: game server (port 8787) and web client (port 5173) with reload.
  - `npm test`, `npm run typecheck` (server and web).
  - `npm run sim`: balance experiments (output in the gitignored `sim-results/`).
  - `npm run moth -- check`: tests the Moth connection (5 credits).
  - `npm run map:svg`: regenerates `design/map.svg` from the game's board renderer. Run it after
    changing `design/map.yaml`.
- `src/engine/`: the pure rules engine. No Node or DOM APIs, so the browser game and the server can
  share it.
  - `Game` holds the rules.
  - `config.ts` has every tunable value.
  - Randomness is injected through `RandomSource`; quantum measurements go through its `measure()`.
- `src/quantum/`: the Moth client, bit providers (Comet, coin toss, local crypto) and `QuantumSource`,
  the buffered `RandomSource` for real games. Pure apart from `fetch` and Web Crypto.
- `src/node/`: Node-only helpers: map loading, the bit pool file, `createHybridSource`, and the
  `npm run moth` CLI (`check`, `pool`, `fill`, `game`).
- `src/sim/`: heuristic bots and the experiment runner. The game server uses the same bots.
- `src/server/`: the game server. `protocol.ts` (message and view types, shared with the web
  client), `view.ts` (per-seat views and action dispatch; pure, also used by the tutorial),
  `room.ts` (one game: seats, bot driver that replays bot turns event by event), `main.ts` (HTTP
  health check and the `/ws` WebSocket).
- `web/`: the browser client. `layout.ts` (sector boxes, packages and automatic 45° trace and
  cable routing), `Board.tsx` (the mainboard SVG), `Game.tsx` (turn controls, hand,
  log, hot-seat curtain, card previews), `rules.ts` (client-side previews only; the server decides),
  `net.ts`. `tutorial/`: the interactive tutorial at `#tutorial`. It runs the engine in the browser
  on hand-built positions (`scenarios.ts`), follows a script of chapters and steps (`steps.tsx`)
  and needs no server. Its measurements use browser randomness and are labelled as such.

## Repo layout

- `README.md`: short project page (title art, goal, links).
- `RULEBOOK.md`: player rules.
- `web/public/art/`: card and title art (WebP, served by the client and used in the docs).
- `design/map.md`, `map.svg`, `map.yaml`: the map, as a description, a diagram and data.
- `design/balance.md`: balance analysis and simulation evidence.
- `src/`, `web/`, `test/`: code.

## Roadmap

1. Rules design ✓
2. Map design ✓
3. Balancing ✓ in simulation. Superposition still needs to be validated in human playtests.
4. Moth integration ✓
5. Tech stack decision ✓
6. Playable prototype ✓ (local: hot-seat, invite links, bots)
7. **Deploy** ← *next*: VPS setup, `play.vincentschall.com`, GitHub Pages, link from the personal
   site (and remove its old React site)
8. Card art ✓; human playtests
9. Interactive tutorial ✓
10. Expansions (see variant candidates)

## Working agreements

- Discuss design decisions in chat **before** writing them into the rules.
- Docs describe the **current state only**: no version history, "changed from" notes or
  "provisional" markers. Git keeps the history.
- Vincent reviews before anything is committed, unless he asks for a commit.
