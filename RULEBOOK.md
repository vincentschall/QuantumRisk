# QuantumRisk — Rulebook

*Version 0.1 (draft) · 2–4 players · ~30 minutes*

> Numbers marked **(provisional)** have not been balanced yet and will probably change.
> Sector and cluster names in the examples are placeholders. The final map is still being designed.

---

## Contents

1. [The Story](#1-the-story)
2. [Overview: what makes QuantumRisk different](#2-overview)
3. [Components](#3-components)
4. [Setup](#4-setup)
5. [How to win](#5-how-to-win)
6. [Your turn](#6-your-turn)
7. [Combat](#7-combat)
8. [Quantum stacks: superposition and measurement](#8-quantum-stacks)
9. [Cards](#9-cards)
10. [Two-player game](#10-two-player-game)
11. [Quantum Mechanics 101](#11-quantum-mechanics-101)
12. [FAQ](#12-faq)
13. [Quick reference](#13-quick-reference)

---

## 1. The Story

Long after the Collapse of the Old Hegemony, the frontier is up for grabs. Its 24 sectors are linked
by hyperlanes and grouped into five star clusters. Rival fleets have a technology no empire had
before: **quantum drive cores**. A fleet with a quantum core does not have to *be* anywhere. It can
exist at two positions at once, until someone looks.

Your job is to command your fleets, outthink your rivals, and take the frontier.

---

## 2. Overview

QuantumRisk is a game of territorial conquest. On your turn you get reinforcements, attack
neighbouring sectors, and move troops around. Two rules make it different from classic dice-based
conquest games:

1. **Battles are deterministic.** There are no dice. If you attack with more troops than the
   defender has, you win. Everyone can calculate the outcome of every battle in advance.
2. **Quantum stacks are the only uncertainty.** You can send a group of troops into
   **superposition**: it is in sector A *or* sector B, 50/50, and **no one knows which**, including you.
   When an enemy attacks one of those sectors, the stack is **measured**. A quantum circuit
   decides where it actually is, and the battle goes on from there.

So the uncertainty is no longer "how will the dice roll?" It is "is there a fleet hiding here or
not?" You decide how much uncertainty goes on the board, and where.

---

## 3. Components

QuantumRisk is a digital game. The game tracks all of the following:

- **The map:** 24 sectors connected by hyperlanes, grouped into 5 clusters.

  | Cluster | Sectors | Cluster bonus **(provisional)** |
  |---|---|---|
  | Cluster A | 4 | +2 |
  | Cluster B | 4 | +2 |
  | Cluster C | 5 | +3 |
  | Cluster D | 5 | +3 |
  | Cluster E | 6 | +4 |

- **Troops:** your fleets. A sector shows two numbers:
  - **Real troops.** They are definitely there.
  - **Quantum branch** (if any), shown as a translucent "ghost" badge with the size of the
    superposed stack, e.g. `5 + ⟨6?⟩`.
- **Sector cards:** one per sector (24). Each shows a particle: **proton**, **neutron** or
  **electron** (8 of each). There are also 2 **photon** wild cards **(provisional)**.
- **Quantum cards:** special-action cards (see [§9](#9-cards)).
- **Mission cards:** secret objectives (see [§5](#5-how-to-win)).
- **Strongholds:** a few sectors are marked as Strongholds. They give **+1 defence** (see
  [§7.2](#72-resolving-the-battle)). Which sectors are Strongholds is decided with the map.
- **The quantum backend:** every superposition is measured by a quantum circuit run through the
  Moth Quantum platform, either on real quantum hardware or on Moth's quantum emulator. The game log
  shows each measurement result and its source.

---

## 4. Setup

1. **Choose a mode:** *Missions* (default) or *Global Domination*.
2. **Turn order** is randomized.
3. **Sectors are dealt** randomly and evenly:

   | Players | Sectors each | Starting troops each **(provisional)** |
   |---|---|---|
   | 2 (+ neutral) | 8 (neutral gets 8) | 22 |
   | 3 | 8 | 20 |
   | 4 | 6 | 18 |

4. The game puts **1 real troop** on every sector you own. The neutral army puts 2 on each of its sectors.
5. **Place your remaining starting troops.** Players take turns placing them, 3 at a time, on their
   own sectors.
6. In Missions mode each player gets **one secret mission**.
7. Nobody starts with quantum stacks. The first player begins.

---

## 5. How to win

### Missions mode (default)

You win **as soon as you complete your secret mission**, even in the middle of another player's
turn, e.g. by surviving an attack. If two missions are completed at the same moment, the player whose turn it is wins
**(provisional)**. Missions are hidden from the other players.

Mission list **(provisional; cluster names will be filled in once the map is final)**:

| # | Mission | Condition |
|---|---|---|
| 1–3 | **Cluster Lord** | Control two specific clusters (e.g. A + E, B + D, C + D). |
| 4 | **Expansion** | Control 14 sectors. |
| 5 | **Fortress Frontier** | Control 11 sectors with at least 3 real troops on each. |
| 6–9 | **Rival** | Eliminate a specific player colour **yourself**. If that colour is not in the game, is you, or is eliminated by another player, your mission becomes *Expansion*. |

### Global Domination mode

You win when you control every sector that belongs to a player. Neutral sectors don't need to be
conquered. In other words, be the last player standing.

### Elimination

A player who controls no sectors is eliminated. The player who took their last sector **takes all
their cards**.

---

## 6. Your turn

Every turn has four phases, always in this order:

```
1. REINFORCE  →  2. QUANTUM  →  3. ATTACK  →  4. FORTIFY
   (required)     (optional)     (optional)     (optional)
```

### Phase 1: Reinforce

You get new real troops:

- **Sectors:** the number of sectors you control ÷ 3, rounded down, **minimum 3**.
- **Clusters:** the bonus of every cluster you fully control.
- **Cards:** whatever you trade in (see [§9](#9-cards)). If you start your turn with **5 or more
  cards**, you must trade a set.
- **Owned-sector bonus:** when you trade a set, every card in it that shows a sector you control
  gives **+2 troops placed on that sector**.

Place all of these troops on sectors you control.

### Phase 2: Quantum

You may do **one** of the following (or nothing):

- **Split:** create a new quantum stack (see [§8.2](#82-splitting)).
- **Self-measure:** measure one of your own quantum stacks (see [§8.4](#84-self-measurement)).

Quantum cards can give you extra actions in this phase.

### Phase 3: Attack

Attack as often as you like, from any sector that has enough real troops (see [§7](#7-combat)).
If you **conquered at least one sector** this turn, you draw **one sector card** at the end of your turn.

### Phase 4: Fortify

Move real troops between your sectors, as many as you like. A move must follow an unbroken chain
of sectors you control, and every sector must keep **at least 1 real troop**. Quantum stacks can't
be moved; only real troops can. 

---

## 7. Combat

### 7.1 Declaring an attack

1. Choose a **source** sector you control and an **adjacent** enemy (or neutral) **target** sector.
2. Choose how many real troops to commit: **N**. Then:
   - N must be **at least 3** (the *minimum attack size*).
   - The source must keep **at least 1 real troop**, so you need at least 4 real troops in a sector
     to attack from it.
   - Only **real** troops can attack. A quantum branch on your source sector doesn't count.
3. If the target holds a quantum branch, it is **measured now** (see [§8.3](#83-measurement)).
4. Count the **defenders D**: the real troops on the target, plus the quantum stack if the
   measurement found it there.

### 7.2 Resolving the battle

| Situation | Result |
|---|---|
| **N > D** (attacker wins) | All defenders are destroyed. The attacker loses **D** troops. The **N − D survivors move into** the conquered sector. You may also move more real troops in from the source (it must keep 1). |
| **N ≤ D** (defender holds) | All N attackers are destroyed. The defender loses **N − 1** troops. |

**Defender's edge:**
- **Ties go to the defender.**
- **Strongholds:** a defending Stronghold sector counts as **D + 1**. The +1 is only a bonus for
  this battle. It isn't a troop and can't be destroyed. Use D + 1 everywhere in the table above,
  so the attacker also loses D + 1 if it wins. Example: 6 real troops on a Stronghold count as
  D = 7. The attacker needs N ≥ 8, and an 8-troop attack wins, loses 7 and moves 1 in.

### 7.3 Examples

| Attack | Defence | Result |
|---|---|---|
| 8 | 5 | Attacker wins. Loses 5, moves 3 in. |
| 6 | 5 | Attacker wins. Loses 5, moves 1 in. Expensive! |
| 5 | 5 | Defender holds. Attacker loses 5, defender loses 4 → 1 defender remains. |
| 6 | 10 | Defender holds. Attacker loses 6, defender loses 5 → 5 remain. |

Since there are no dice, you can always calculate a battle against **real** troops exactly.
Uncertainty only appears when a quantum stack might be involved.

---

## 8. Quantum stacks

### 8.1 What is a quantum stack?

A **quantum stack** is a group of troops in **superposition** across exactly **two** of your
sectors, its **branches**. The stack is **entirely** in one branch or **entirely** in the other,
never split between them, and each branch has a **50% chance**.

A branch sits **on top of** a sector's real troops. A sector must always have at least 1 real troop
to stay yours. A quantum branch alone can never hold a sector.

On the map, a sector with 5 real troops and a branch of a 6-troop stack looks like this:

```
  ┌──────────────┐
  │  KEPLER GATE │
  │   5  + ⟨6?⟩  │   ← 5 for sure, maybe 6 more
  └──────────────┘
```

If this sector is attacked, there are either **5** or **11** defenders, with a 50/50 chance.

### 8.2 Splitting

In your Quantum phase you may **split**:

1. Choose a **source** sector and how many real troops **S** to put into superposition. The source
   must keep at least 1 real troop.
2. Choose **two different sectors** as branches. Each must be connected to the source by an
   **unbroken chain of sectors you control**. Picture half of the fleet flying off one way and half
   the other way. Each branch must also be a sector you control and must **not already hold a
   quantum branch**. The source itself may be one of
   the branches.
3. The S troops leave the source's real count and become a quantum stack of size S, with one branch
   in each chosen sector.

The game doesn't decide where the stack is. The quantum state is only measured when it has to be.

**You can't** split a quantum stack again, merge stacks, move a stack during Fortify, or attack
with it. To use those troops normally, you have to measure the stack first.

### 8.3 Measurement

A quantum stack is **measured** when:

- an enemy **attacks either of its branch sectors**, or
- its owner **self-measures** it ([§8.4](#84-self-measurement)), or
- an opponent plays a **Forced Measurement** card on it ([§9](#9-cards)).

When a stack is measured:

1. The quantum computer returns **one** result: branch A or branch B, 50/50.
2. The stack **collapses**: all S troops become **real troops** in the sector the result picked.
3. The other branch disappears. It was never there.

Collapse can't be undone. The result is shown to all players.

If the measurement happened because of an attack, the battle is fought with the post-collapse
numbers, as described in [§7.1](#71-declaring-an-attack).

### 8.4 Self-measurement

In your Quantum phase you may measure one of your own stacks instead of splitting. You don't get
to choose where it lands; 50/50 still applies. Players usually do this to get the troops back as
real troops, so they can attack with them or fortify.

### 8.5 Key facts

- **No peeking.** Nobody knows where a stack is, not even its owner. The result doesn't exist yet.
  It is created at the moment of measurement.
- **Troops are never duplicated.** A 6-stack is worth 6 troops, not 12. It *threatens* two places
  but *defends* only one.
- **Bonuses and ownership come from real troops only.** Cluster bonuses and sector counts don't
  depend on quantum stacks.

---

## 9. Cards

### 9.1 Getting cards

At the end of any turn in which you conquered at least one sector, draw **one sector card**.
The maximum hand size is 5. At 5 or more cards you must trade at the start of your next Reinforce
phase.

### 9.2 Playing sector cards (Reinforce phase only)

| Play | Requirement | Reward |
|---|---|---|
| **Three of a kind** | 3 × proton, 3 × neutron or 3 × electron | **+4 troops** + **1 Quantum card** |
| **Full atom** | 1 proton + 1 neutron + 1 electron | **+6 troops** + **1 Quantum card** |

A **photon** card is wild and can stand in for any particle. Bonuses are fixed and do **not**
escalate, which keeps games short. Traded cards go back into the deck.

**Owned-sector bonus:** when you trade a set (three of a kind or full atom), every card in it that
shows a sector you control gives **+2 extra troops on that sector**, up to +6 per set. Photon cards
show no sector.

### 9.3 Quantum cards

Quantum cards are kept in hand, and you can hold them on top of the 5-card hand limit. You may play
any number during your Quantum phase. They do not count as your one Quantum action.

| Card | Effect | Copies **(provisional)** |
|---|---|---|
| **Forced Measurement** | Measure any **enemy** quantum stack right now. Plan your attacks after you see the result. | 6 |
| **Extra Split** | Do one extra split this Quantum phase. | 4 |

*More Quantum cards may be added after playtesting.*

---

## 10. Two-player game

With two players, a third **neutral army** takes part:

- It gets 8 sectors with **2 real troops** each.
- It **never** takes a turn: no reinforcing, attacking, splitting or card draws.
- Neutral sectors are attacked like any other sector.
- Missions that target a colour can't target the neutral army. Global Domination is won by
  eliminating the other player; the neutral army doesn't need to be destroyed.

---

## 11. Quantum Mechanics 101

*You don't need this section to play, but it explains what's going on, and it's all real physics.*

### Bits and qubits

A normal computer stores information in **bits**. Each bit is either **0** or **1**, like a light
switch that is either off or on.

A quantum computer uses **qubits**. A qubit can be in a **superposition**: a combination of 0 *and*
1 at the same time. It isn't secretly 0 or secretly 1 with the answer hidden somewhere. Before it is
measured, the qubit doesn't have a definite value.

In physics notation, an equal superposition is written like this:

```
|ψ⟩ = (|0⟩ + |1⟩) / √2
```

Read it as "half zero, half one". The √2 makes the probabilities add up to 100%.

### Measurement

When you **measure** a qubit, you get a definite answer: 0 or 1. For the state above, each answer
has a **50%** chance. This is the **Born rule**: the chance of each result is the square of its
weight, here (1/√2)² = ½.

After the measurement the qubit **collapses**. It is now simply 0 (or simply 1), and the
superposition is gone for good. If you measure it again, you get the same answer.

### What QuantumRisk does with this

| In the game | In the quantum computer |
|---|---|
| Your stack is in Kepler Gate *or* Halo Station | One qubit: `|0⟩` = Kepler Gate, `|1⟩` = Halo Station |
| You split a stack | The qubit is put into equal superposition with a **Hadamard gate (H)** |
| Someone attacks a branch | The qubit is **measured** |
| The stack appears in one sector | The qubit **collapsed** to 0 or 1 |

The circuit is small:

```
|0⟩ ──[ H ]──[ M ]══> 0 = branch A, 1 = branch B
```

The game runs this circuit through the **Moth Quantum platform**, either on real quantum hardware
or on Moth's quantum emulator. The game log tells you which one produced each result.

### "Isn't that just a coin flip?"

That's a fair question. With a single 50/50 qubit, the **statistics** match a fair coin. There are
two differences:

1. **The physics is different.** A coin that has been flipped and hidden already has a result. A
   qubit in superposition doesn't. Its value only comes into being when it is measured.
2. **The randomness comes from a quantum circuit.** On real hardware it is a physical quantum
   process, not a pseudo-random algorithm. The game is honest about where each result came from.

Future expansions (entanglement, interference) will add effects that a coin *can't* reproduce.

---

## 12. FAQ

**Can a sector hold branches from two different stacks?**
Not in this version. Each sector can hold at most one quantum branch **(provisional)**.

**Can I put a branch on an enemy sector?**
No. Both branches must be sectors you control, connected to the source by your own sectors.

**What happens to a branch if the sector's last real troop leaves?**
It can't happen. Every sector must keep at least 1 real troop, and a sector can only be lost to an
attack, which measures the stack first.

**If I conquer a sector after the stack turned out to be elsewhere, does the stack move?**
No. It was "always" in the other branch. It's now real troops in that other sector.

**Do I know my own stack's location?**
No. The result doesn't exist until measurement.

**Can I attack from a sector that holds a branch?**
Yes, but only with its real troops.

**Is the measurement really done on a quantum computer?**
It is done through the Moth Quantum platform, on real quantum hardware or on Moth's quantum
emulator. The log shows which. If the backend is unavailable, the game uses a backup
source and says so in the log.

