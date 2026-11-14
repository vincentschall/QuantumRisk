# Balance

Why the rule values are what they are, and the evidence behind them. The values themselves live in
`RULEBOOK.md` and `src/engine/config.ts`.

**Method:** heuristic bots play the full rules in the TypeScript engine (`npm run sim`), with 2,000
games per configuration. A game counts as a timeout after 30 rounds.
- **greedy:** attacks whenever it can win and commits everything.
- **turtle:** defends first and attacks rarely.
- **quantum:** greedy, plus it splits.
- **qturtle:** turtle, plus it splits.

The bots are simple and aggressive, so treat the numbers as relative comparisons between rule
variants, not exact human timings. Fair win rates are 50% (2 players), 33% (3) and 25% (4).

## Current rules at a glance

| | Seat win % | Missions: median rounds (p10–p90) | Domination: median rounds (p10–p90) | Timeouts |
|---|---|---|---|---|
| 2p | 51 / 49 | 6 (3–10) | 8 (6–12) | 0% |
| 3p | 34 / 35 / 32 | 5 (2–10) | 9 (6–15) | 0% |
| 4p | 26 / 25 / 25 / 24 | 6 (3–12) | 10 (6–17) | 0% |

**Missions fit the 30-minute target:** 6 rounds × 4 players is 24 turns, about 25–30 minutes at
about 1 minute per turn. Domination is the long mode, at 40+ minutes.

## Cluster bonuses

Risk's continent bonuses follow **bonus ≈ 0.85 × (sectors + entry sectors) / 2**, accurate to within
about 1 across all six continents. The cluster bonuses follow the same pattern:

| Cluster | Sectors | Entry sectors | Formula | Bonus |
|---|---|---|---|---|
| CPU | 6 | 3 | 3.8 | +4 |
| GPU | 5 | 2 | 3.0 | +3 |
| RAM | 5 | 2 | 3.0 | +3 |
| SSD | 4 | 1 | 2.1 | +2 |
| PSU | 4 | 3 | 3.0 | +3 |

## Income and cards

Base income is `max(3, sectors ÷ 3)`, which is **almost always 3**: you need 12 sectors to get 4. The
economy runs on cluster bonuses (+2 to +4) and card sets:
- A set is worth +4 or +6, plus +2 for every owned sector shown on its cards.
- So a set gives up to +12 troops and a Quantum card.

**Fixed set values, no escalation.** Classic escalation (4, 6, 8, 10, 12, 15, …) didn't shorten
games, because there were no stalemates to break. It only added big late-game swings:

| | Median rounds (fixed) | Median rounds (escalating) | Biggest set per game, avg (escalating) |
|---|---|---|---|
| 3p missions / domination | 5 / 9 | 5 / 9 | 8 / 21 troops |
| 4p missions / domination | 6 / 10 | 6 / 10 | 11 / 31 troops |

## Starting deal

Random dealing rarely hands someone a complete cluster before turn 1 (200,000 simulated deals):
3.2% with 2 players, 4.7% with 3 and 1.2% with 4, almost always the SSD or the PSU. That's
acceptable.

## Seat compensation and the Expansion mission

Seat win rates (missions, greedy bots):

| Variant | 2p | 3p | 4p |
|---|---|---|---|
| **Current:** seat bonus 2p +0/+2, 3p +0/+1/+2, 4p none | **51 / 49** | **34 / 35 / 32** | **26 / 25 / 25 / 24** |
| No seat bonus | 61 / 39 | 37 / 34 / 29 | 26 / 25 / 25 / 24 |
| No seat bonus, no attacks in round 1 | 61 / 40 | 35 / 35 / 30 | 26 / 25 / 26 / 23 |
| Seat bonus +0 / +2 / +4 / +6 | 51 / 49 | 32 / 34 / 35 | 20 / 22 / 26 / 32 |

**Expansion needs 18 / 16 / 14 sectors** (2 / 3 / 4 players). Players start with 8 sectors in 2- and
3-player games, so a flat target of 14 was too easy:
- Half of all 2-player games were won by Expansion, with a median of round 2.
- Games lasted 4 rounds instead of 6.

## Combat

- **Taking a sector with D defenders costs exactly D troops,** or D + 1 on a Stronghold. Add 1 per
  sector left behind when you chain attacks. A stack of 12 can blitz through about 5 one-troop
  sectors, which is comparable to Risk.
- **Strongholds:** when an attack fails, the defender loses N − 2 instead of N − 1. That way a
  Stronghold can never be emptied by a failed attack (N ≤ D + 1 means at most D − 1 losses).
- **Probe rule:** an attack on a sector holding a quantum branch must commit at least the stack's
  size.
  - Without it, a minimum attack of 3 into a defended sector would reveal any stack for a net cost of
    about 1 troop (attacker −3, defender −2).
  - The bots never probe on purpose, because their all-in attacks always meet the minimum anyway.
    So this rule is untested by simulation.

## Superposition

Win rates of a bot that splits against an otherwise identical bot that doesn't (rotated seats):

| Line-up | **Split in Fortify, 1/turn (current)** | Split in Fortify, unlimited | Split in Quantum phase |
|---|---|---|---|
| 2p quantum vs greedy | 49% | 49% | 43% |
| 4p quantum vs 3× greedy | 27% | 27% | 23% |
| 2p qturtle vs turtle | 51 / 43 | 51 / 44 | 45 / 44 |
| 4p 2× qturtle vs 2× turtle | 26 / 20 | 26 / 20 | 22 / 21 |
| Timeouts, 2p qturtle vs turtle | 6% | 6% | 12% |

- **Splitting in Fortify** turns superposition into a real edge. You superpose troops that would
  otherwise sit idle, and stalled defensive games are halved.
- **Splitting before attacking** costs tempo and is a net disadvantage.
- **One split per turn** plays the same as unlimited. It keeps the Extra Split card meaningful and
  the number of quantum measurements (Moth credits) bounded.

## Open questions for human playtests

- How strong is superposition when players bluff and probe deliberately? The bots barely do either.
- Does the probe rule (commit ≥ stack size) feel right?
- How long do turns take for humans? This decides whether 4-player Missions really fits 30 minutes.
