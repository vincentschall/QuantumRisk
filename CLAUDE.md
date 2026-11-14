# QuantumRisk

## Goal

QuantumRisk is a **digital** strategy game of territorial conquest for **2–4 players**, played in about
**30 minutes**, on a small map shaped like a **computer mainboard**. It is inspired by the classic dice-based
conquest board game, with one key difference: **combat is fully deterministic, and quantum
superposition is the only source of uncertainty.** Players can put armies into a 50/50 superposition
across two territories, and an attack *measures* them. The outcomes of those measurements come from
quantum circuits run through the **Moth Quantum platform** (`platform.mothquantum.com`).

The game will eventually be hosted on its own domain and played in the browser.

## Design principles

1. **Deterministic battles.** No dice. With the same armies, the same battle always has the same result.
2. **Quantum is the only randomness.** Every random result in the game comes from a measurement.
   Card draws and setup are the only exceptions, and even those should come from the quantum
   backend when it is available.
3. **Superposition is honest.** Nobody knows where a superposed stack is, not even its owner,
   until it is measured. The game never reveals it early.
4. **Plain-language quantum.** The rules teach superposition and measurement correctly but without
   jargon. Every quantum rule maps to a real circuit, e.g. split = Hadamard gate,
   collapse = measurement.
5. **Short and tight.** 30 minutes, 2–4 players, a small map. Cut anything that makes games longer.
6. **Simple first, deep later.** Only superposition and measurement for now. Entanglement,
   interference and tunneling are possible expansions and need an explicit design decision before
   they are added.
7. **Original IP.** Own mainboard map (generic component names, no hardware brands), own wording. No trademarked names, art or
   text from existing games.
8. **English only.**

## Decision log (agreed 2026-11-14)

| # | Topic | Decision |
|---|---|---|
| 1 | Platform | Digital only, browser-hosted on a domain later. |
| 2 | Title / setting | **QuantumRisk**. The map is a computer mainboard: 5 clusters = **CPU (6), GPU (5), RAM (5), SSD (4), PSU (4)**, connected by circuit traces. **No lore or factions**: players are plain colours with classical troops. Sector cards keep the proton / neutron / electron particles. |
| 3 | Language | English only. |
| 4 | Combat | Attacker commits N, defender has D. If N > D: defender wiped out, attacker loses D and moves in N − D. If N ≤ D: attacker loses all N, defender loses N − 1. Balancing can be reworked later. |
| 5 | Defender bonus | Ties go to the defender (in #4) **plus a few Stronghold sectors on the map (+1 defence)**. Which sectors become Strongholds, and how many, is decided during map design. |
| 6 | Superposition shape | A stack can be in **at most 2** territories, **exclusively**: all troops in A *or* all in B. |
| 7 | Split range | Both target territories must be connected to the source by an unbroken chain of territories you own. |
| 8 | Probabilities | 50/50 only (for now). |
| 9 | Knowledge | Nobody knows the outcome until it is measured, including the owner. |
| 10 | Measurement trigger | An enemy attack on either branch (plus a voluntary self-measure in the Quantum phase, and the Forced Measurement card). |
| 11 | Minimum attack | An attack must commit **at least 3** armies (lowered from 5). |
| 12 | Ownership | A territory needs **≥ 1 real troop** to be owned. Superposed stacks sit on top of real troops ("5 real + maybe 5" means 5 or 10 defenders). |
| 13 | Quantum scope | Superposition + measurement only. |
| 14 | Map size | 24 sectors in 5 regions (4/4/5/5/6). The actual layout comes later. |
| 15 | Win conditions | Two modes: **Missions** (default) or **Global Domination**. Missions are **classic only** (cluster pairs, sector counts, rival elimination). Quantum-themed missions were tried and rejected. *Rival* missions follow the classic rule: you must eliminate the target yourself. If someone else does it, the mission becomes *Expansion*. |
| 16 | Cards | Sector cards show a particle (proton / neutron / electron). Cards are traded **only as sets of three** (no single-card plays): troop bonus + a Quantum card (e.g. Forced Measurement, Extra Split), plus +2 on **every** owned sector shown in the set (no cap). |
| 17 | 2 players | Neutral army. |
| 18 | Turn order | Reinforce → Quantum (optional: one split *or* one self-measure) → Attack (any number, ≥1 conquest to draw a card) → Fortify (move any number of real troops). |
| 19 | Measurement source | Hybrid: pre-fetched real-hardware (QPU) bits, then live Moth emulator, then a local fallback. The log shows the source of every measurement. |
| 20 | Map | "The Mainboard" v1.0 (`design/map.md`): 24 sectors, 37 connections (7 buses between clusters). Strongholds: VRM, Memory Controller, PCIe Slot. |

The rulebook doesn't mark unbalanced values. Starting armies, card bonuses, cluster bonuses, hand
limit, Quantum card counts and the one-branch-per-sector limit get tuned in roadmap step 3, and the
rulebook is updated whenever a value changes.

### Defender bonus: alternatives considered (#5)

These were kept in case balancing needs more defence later:
entrenchment +1 (the sector was held since the start of the attacker's turn), cheaper repulse
(on a failed attack the defender loses N − 2), occupation cost (the winner moves in N − D − 1).

## Quantum backend (Moth Quantum)

Docs: https://docs.mothquantum.com/docs/intro · API reference: `https://api.mothquantum.com/docs`
(OpenAPI at `/openapi.json`, not read yet).

- **Auth:** `Authorization: Bearer moth_…`. The key is in `.env` as `MOTH_API_KEY` and was checked
  with `GET /api/v1/me` → 200 on 2026-11-14. **Never commit `.env`**; it is gitignored and
  `.env.example` is the template. Keys are server-side only: never log them or send them to the
  browser. All quantum calls go through our own backend.
- **Base URL:** `https://api.mothquantum.com/api/v1`
- **Model:** you can't upload your own circuit (no QASM or Qiskit input). You run named **engines**
  with JSON params:
  - `POST /engines/{engine_id}/process` with `{"params": {...}}` → 202 `{job_id, status: "queued"}`
  - `GET /jobs/{id}/status`: queued → processing → completed / failed / cancelled
  - `GET /jobs/{id}/result` → `{"result": {...}}`. Returns 409 if not finished and 410 if expired.
- **The engine we need:** `coin-toss-v1`, which is exactly a 1-qubit H + measure circuit.
  - params: `mode` (`"emu"` default, or `"qpu"` for real IBM hardware), `shots` (default 10), and
    optionally `backend_name` (IBM device; if blank, the least busy one).
  - result: `output` ("heads"/"tails" = the majority), `heads`, `tails`, `shots`. **Counts only, no
    per-shot list.** So one measurement = one job with `shots: 1`. You can't batch it into a
    sequence of bits.
  - Cost: **2 credits per run.** Credit prices and plan aren't documented yet.
- **Latency:** `emu` takes seconds. `qpu` can queue for minutes to hours, so it's unusable for
  measurements during play. There's no webhook, so poll every 2–5 s. Jobs time out after 300 s.
- **Limits:** 300 requests/min per key; a 429 means back off.
- **To investigate:** whether `graph-v1` (2–20 qubits, 5 credits) can return many independent
  bits per job for batching; how long results are kept; credit budget per game.

### Measurement source: decided, hybrid (#19)

`emu` is Moth's **simulator**, not quantum hardware. `qpu` is real hardware but far too slow during
play. Options:
1. **Live emu:** every measurement runs `coin-toss-v1` in emu mode at the moment it is needed.
   This is fast and honest about timing ("the result didn't exist before"), but it's simulated.
2. **QPU pool:** before or between games, run many real-hardware jobs and store the bits. At a
   measurement, take the next bit from the pool. The randomness is real quantum randomness, but
   the bits exist before they're used, which weakens principle 3.
3. **Hybrid:** use the QPU pool when it has bits, otherwise fall back to live emu, with a local
   fallback if Moth is down. The game log shows the source of every measurement.

**Decision (2026-11-14): option 3, hybrid.** Order of sources: QPU pool, then live emu, then a
local fallback. Every measurement is logged with its source, and the rulebook describes the source
as "Moth Quantum (hardware or emulator, shown in the log)".

## Roadmap

1. **Rules design** ✓
   - [x] Core decisions (table above)
   - [x] `RULEBOOK.md` v0.1 draft
   - [x] Review rulebook (Vincent)
   - [x] Decide defender bonus (#5): ties + Stronghold sectors
   - [x] Confirm provisional numbers
   - [x] Decide the measurement source: hybrid (QPU pool, then emu, then local)
2. **Map design** ✓. "The Mainboard" v1.0 is in `design/map.md`, `design/map.svg` and `design/map.yaml`.
3. **Balancing on paper / in a simulation.** ← *we are here* Script bots (random, greedy, turtle) and check game
   length (target ≤ 30 min ≈ 8–12 rounds), first-player advantage, and the value of superposition
   vs. plain play. Tune min attack, card bonuses and starting armies.
4. **Moth integration spike.** Read the OpenAPI spec, run `coin-toss-v1` (emu + qpu) and measure
   latency and credit cost per game. Check whether `graph-v1` can batch bits, then build the pool
   and fallback.
5. **Tech stack decision.** Frontend, backend, multiplayer model (hot-seat vs. online), hosting.
   Not decided yet.
6. **Prototype.** Hot-seat, local, with the real quantum backend.
7. **Online multiplayer.** Lobbies, turn timers, reconnect.
8. **Tutorial mode in-game.** An interactive online tutorial covering the first split, attacking into uncertainty, probing and bluffing, and cards, plus strategy tips. The rulebook has none.
9. **Polish and deploy** to the domain.
10. **Possible expansions.** Entanglement, weighted (non-50/50) splits, more Quantum cards, timed mode.

## Repo layout

- `CLAUDE.md`: this file (goals, principles, decisions, status)
- `RULEBOOK.md`: player-facing rules (tutorials and strategy tips will be in-game, not in the rulebook)
- `design/map.md`, `map.svg`, `map.yaml`: the approved map (human-readable, diagram, machine-readable)
- `design/`: other design documents and drafts for review
- `.env`: secrets (gitignored); `.env.example` is the template

## Working agreements

- Discuss design decisions in chat **before** writing them into the rules. Log them in the table above.
- No code until the rules are reviewed and the roadmap reaches step 4 or 5.
- Vincent reviews before anything is committed.
