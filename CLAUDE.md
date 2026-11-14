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
8. **English only. No lore or factions:** players are plain colours with ordinary troops. Sector
   cards show particles (proton / neutron / electron, photon = wild).

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
    circuit.

## Quantum backend (Moth Quantum)

Docs: https://docs.mothquantum.com/docs/intro · API: `https://api.mothquantum.com/api/v1`

- **Auth:** `Authorization: Bearer <MOTH_API_KEY>`.
  - The key is in `.env`, which is gitignored; `.env.example` is the template.
  - The key is server-side only: never log it, commit it or send it to the browser.
- **Model:** you can't submit your own circuits; you run named engines.
  - Submit: `POST /engines/{id}/process` with `{"params": {...}}`, which returns 202 with a `job_id`.
  - Poll: `GET /jobs/{id}/status`.
  - Fetch: `GET /jobs/{id}/result`. This returns 409 while the job is pending and 410 once the
    result has expired.
- **`coin-toss-v1`:** a 1-qubit H + measure circuit.
  - Params: `mode` (`emu` or `qpu`), `shots`, and an optional `backend_name`.
  - Result: `heads`, `tails`, plus `output` (the majority). Counts only, so one measurement means
    one job with `shots: 1`.
  - Cost: 2 credits per run.
- **Latency and limits:**
  - `emu` (simulator) takes seconds. `qpu` (IBM hardware) can queue for minutes to hours.
  - Poll every 2–5 s. Jobs time out after 300 s.
  - 300 requests/min per key.
- **Measurement source:** hybrid. A pool of pre-fetched QPU results comes first, then live `emu`,
  then a local PRNG fallback. Every measurement is logged with its source.

## Code

- **Language:** TypeScript. Run `npm test` for the engine tests and `npm run sim` for the balance
  experiments (output goes to `sim-results/`, which is gitignored).
- `src/engine/`: the pure rules engine. No Node or DOM APIs, so the browser game and the server can
  share it.
  - `Game` holds the rules.
  - `config.ts` has every tunable value.
  - Randomness is injected through `RandomSource`; quantum measurements go through its `measure()`.
- `src/node/`: Node-only helpers (map loading).
- `src/sim/`: heuristic bots and the experiment runner.

## Repo layout

- `RULEBOOK.md`: player rules.
- `design/map.md`, `map.svg`, `map.yaml`: the map, as a description, a diagram and data.
- `design/balance.md`: balance analysis and simulation evidence.
- `src/`, `test/`: code.

## Roadmap

1. Rules design ✓
2. Map design ✓
3. Balancing ✓ in simulation. Superposition still needs to be validated in human playtests.
4. **Moth integration** ← *current*
5. Tech stack decision (frontend, backend, multiplayer model, hosting)
6. Hot-seat prototype with the real quantum backend
7. Online multiplayer
8. In-game tutorial (first split, attacking into uncertainty, probing, cards, strategy tips)
9. Polish and deploy
10. Expansions (see variant candidates)

## Working agreements

- Discuss design decisions in chat **before** writing them into the rules.
- Docs describe the **current state only**: no version history, "changed from" notes or
  "provisional" markers. Git keeps the history.
- Vincent reviews before anything is committed, unless he asks for a commit.
