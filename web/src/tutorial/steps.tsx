/**
 * The tutorial script. Every step either explains something (Next button) or asks for one specific
 * move (`allow` accepts it, `done` decides when the step is finished). Moves go through the real rules
 * engine, so what the player learns here is exactly how the game behaves.
 */
import type { ReactNode } from "react";
import type { Game, LogEvent } from "../../../src/engine/index.js";
import type { Action } from "../../../src/server/protocol.js";
import { COLORS, QUANTUM } from "../rules.js";
import { MAP, scenarios } from "./map.js";
import { RIVAL, YOU } from "./scenarios.js";

export interface Ctx {
  g: Game;
}

export interface Step {
  title: string;
  body: (c: Ctx) => ReactNode;
  /** What to do now, shown as the highlighted task line. */
  task?: (c: Ctx) => ReactNode;
  /** Start this step from a fresh board (first step of a chapter). */
  setup?: () => Game;
  /** Full-screen slide instead of the side-bar coach. */
  slide?: { art: string };
  highlight?: (c: Ctx) => string[];
  dim?: boolean;
  /** Accepts the move (true) or says what to do instead. No `allow`: the step only has a Next button. */
  allow?: (a: Action, c: Ctx) => true | string;
  /** After an allowed move: is the step finished? Default: yes. */
  done?: (c: Ctx) => boolean;
  /**
   * Scripted events (the Rival's turn), started by a button with this label. `run` calls `finish`
   * when done; the player then reads the board and clicks Next. Returns a cleanup.
   */
  script?: { label: string; run: (c: Ctx & { refresh(): void; finish(): void }) => () => void };
}

export interface Chapter {
  title: string;
  steps: Step[];
}

const You = () => <b style={{ color: COLORS[YOU] }}>you</b>;
const Rival = () => <b style={{ color: COLORS[RIVAL] }}>Rival</b>;
const Q = ({ children }: { children: ReactNode }) => <b style={{ color: QUANTUM }}>{children}</b>;

const last = <T extends LogEvent["type"]>(g: Game, type: T) => [...g.log].reverse().find((e) => e.type === type) as Extract<LogEvent, { type: T }> | undefined;
/** Size of the player's stack in the superposition lesson (it is measured by the Rival's attack). */
const stackSize = (g: Game) => g.stacks.find((s) => s.owner === YOU)?.size ?? ([...g.log].reverse().find((e) => e.type === "split") as { size: number } | undefined)?.size ?? 4;
const only = (want: Action["type"], msg: string) => (a: Action) => (a.type === want ? true : msg);

const CLUSTER = (name: string) => () => MAP.clusterSectors.get(name) ?? [];

export const CHAPTERS: Chapter[] = [
  // ─────────────────────────────── 1 ───────────────────────────────
  {
    title: "Welcome",
    steps: [
      {
        title: "Welcome to QuantumRisk",
        setup: scenarios.first,
        slide: { art: "title" },
        body: () => (
          <>
            <p>
              Deep inside every computer there is one board that holds everything together: the <b>mainboard</b>. In QuantumRisk, two to four commanders fight to
              control it: the processor, the memory, the storage, the graphics card and the power lines.
            </p>
            <p>
              Their armies follow the rules of quantum physics. A group of troops can be in <Q>two places at once</Q>, and nobody knows which one is real until
              someone looks.
            </p>
            <p className="muted">
              This tutorial takes about 15 minutes. You make real moves on the real board, and you can leave at any time with <b>Back to menu</b>.
            </p>
          </>
        ),
      },
      {
        title: "A strategy game without dice",
        slide: { art: "title" },
        body: () => (
          <>
            <p>Players take turns. On your turn you get new troops, attack neighbouring sectors and move your troops around.</p>
            <p>
              <b>Battles have no dice.</b> The bigger army wins, and you can work out every battle exactly before you start it.
            </p>
            <p>
              The only luck in the game is quantum. You can put troops into <Q>superposition</Q> across two of your sectors. Your opponents can't know which
              sector they are in, and neither can you. A quantum computer decides only when it matters.
            </p>
          </>
        ),
      },
      {
        title: "How to win",
        slide: { art: "title" },
        body: () => (
          <>
            <p>
              At the start every player gets a <b>secret mission</b>. Complete yours and you win immediately, even during someone else's turn. Missions look like
              this:
            </p>
            <ul>
              <li>Control two particular clusters, e.g. the CPU and the SSD</li>
              <li>Control 18 sectors (fewer with more players)</li>
              <li>Control 11 sectors with at least 3 troops on each</li>
              <li>Eliminate one particular opponent yourself</li>
            </ul>
            <p>
              Your mission is shown in the side bar under <b>Secret mission</b>. Nobody else sees it, so watch what your opponents go after. A game takes about 30
              minutes. (There is also a <b>Domination</b> mode: the last player standing wins.)
            </p>
          </>
        ),
      },
    ],
  },
  // ─────────────────────────────── 2 ───────────────────────────────
  {
    title: "The board",
    steps: [
      {
        title: "The mainboard",
        setup: scenarios.first,
        body: () => (
          <>
            <p>
              The board has <b>24 sectors</b>, the small boxes. Each one shows its name and the number of <b>troops</b> on it. The colour shows who controls it:{" "}
              <You />, your <Rival />, or grey for <b>neutral</b> sectors. Neutral troops only appear in 2-player games and never attack.
            </p>
            <p>
              The lines are <b>connections</b>. You can only attack or move troops along them:
            </p>
            <ul>
              <li>thin lines (traces) inside a cluster,</li>
              <li>thick yellow lines (buses) between clusters,</li>
              <li>dark power cables around the edge of the board.</li>
            </ul>
          </>
        ),
      },
      {
        title: "Clusters and bonuses",
        body: () => (
          <>
            <p>
              Sectors are grouped into <b>5 clusters</b>, the large boxes. If you control <b>every</b> sector of a cluster, you get its bonus as extra troops at the
              start of each of your turns: the gold <b>+N</b> next to its name.
            </p>
            <p>Let's look at each cluster.</p>
          </>
        ),
      },
      {
        title: "CPU: +4",
        highlight: CLUSTER("CPU"),
        dim: true,
        body: () => (
          <>
            <p>
              The processor: four cores, the <b>Memory Controller</b> that talks to the RAM, and the <b>Root Complex</b> where the connections to the graphics card
              and the SSD start.
            </p>
            <p>
              It has the biggest bonus and sits in the middle, next to every other cluster. That makes it rich but hard to hold. Enemies can come in at three
              places: Core 0 (from the VRM), the Memory Controller (from the RAM) and the Root Complex (from the GPU and the SSD).
            </p>
          </>
        ),
      },
      {
        title: "RAM: +3",
        highlight: CLUSTER("RAM"),
        dim: true,
        body: () => (
          <p>
            The memory: the <b>Memory Bus</b> and four memory slots (DIMMs). There are two ways in: the Memory Bus, which connects to the CPU's Memory Controller,
            and DIMM B2, which connects to the ATX 24-Pin power connector.
          </p>
        ),
      },
      {
        title: "SSD: +2",
        highlight: CLUSTER("SSD"),
        dim: true,
        body: () => (
          <p>
            The storage: the <b>M.2 Slot</b> it plugs into, the Flash Controller, a DRAM Cache and the NAND flash chips. It has the smallest bonus, but there is{" "}
            <b>only one way in</b>: the M.2 Slot. Hold that gate and you hold the cluster. The M.2 Slot itself can be attacked from the CPU and from the GPU.
          </p>
        ),
      },
      {
        title: "GPU: +3",
        highlight: CLUSTER("GPU"),
        dim: true,
        body: () => (
          <p>
            The graphics card: its <b>PCIe x16</b> connection to the board, the Shader Array, its own memory (VRAM), the Display Out and the Power Connector. There
            are two ways in: PCIe x16 and the Power Connector. Display Out is deep inside, a safe place for reserves.
          </p>
        ),
      },
      {
        title: "Power: +3",
        highlight: CLUSTER("Power"),
        dim: true,
        body: () => (
          <p>
            Not one box but four power connectors spread around the edge of the board, joined by cables: EPS 8-Pin, VRM, ATX 24-Pin and PCIe Power Cable. Power
            touches the CPU, the RAM and the GPU, so it is hard to hold. Its cables are also shortcuts around the board.
          </p>
        ),
      },
      {
        title: "Strongholds",
        highlight: () => ["VRM", "Memory Controller", "PCIe x16"],
        dim: true,
        body: () => (
          <p>
            Three sectors carry a <b style={{ color: "var(--gold)" }}>gold shield</b>: VRM, Memory Controller and PCIe x16. These <b>Strongholds</b> defend with
            +1: three troops there defend like four.
          </p>
        ),
      },
    ],
  },
  // ─────────────────────────────── 3 ───────────────────────────────
  {
    title: "Your first turn",
    steps: [
      {
        title: "Setting up",
        setup: scenarios.first,
        highlight: () => ["Core 3"],
        body: () => (
          <>
            <p>
              At the start the sectors are dealt out at random, with one troop on each. Then everyone takes turns placing the rest of their starting troops, three at
              a time, on their own sectors.
            </p>
            <p>Core 3 borders your Rival's Core 2, so it's a good place to build up an attack.</p>
          </>
        ),
        task: () => (
          <>
            Click <b>Core 3</b> three times (or shift-click it once), then click <b>Confirm</b>.
          </>
        ),
        allow: (a) =>
          a.type !== "setupPlace" ? "Place your troops first: click Core 3 three times, then Confirm." : Object.keys(a.placements).every((s) => s === "Core 3") ? true : "For this lesson, put all 3 troops on Core 3. Click Reset and try again.",
      },
      {
        title: "Phase 1: Reinforce",
        body: ({ g }) => (
          <>
            <p>
              Setup is done (in a real game this goes on until everyone has placed all their troops). Every turn has four phases, shown at the top of the side bar:{" "}
              <b>Reinforce → Quantum → Attack → Fortify</b>.
            </p>
            <p>First you get new troops:</p>
            <ul>
              <li>
                the number of sectors you hold ÷ 3, rounded down, <b>but at least 3</b>. You hold {g.ownedSectors(YOU).length}, so you get 3;
              </li>
              <li>
                plus the bonus of every cluster you hold completely. You hold the <b>whole SSD</b>: +2.
              </li>
            </ul>
          </>
        ),
        task: ({ g }) => (
          <>
            Place your {g.reinforcementsLeft} troops (click your sectors, Core 3 is a good choice), then click <b>Place</b>.
          </>
        ),
        allow: only("place", "Place your new troops first: click your sectors, then Place."),
        done: ({ g }) => g.reinforcementsLeft === 0,
      },
      {
        title: "On to the Quantum phase",
        body: () => <p>All your troops are placed.</p>,
        task: () => (
          <>
            Click <b>Continue to Quantum →</b>.
          </>
        ),
        allow: only("endPhase", "Click Continue to Quantum → in the side bar."),
      },
      {
        title: "Phase 2: Quantum",
        body: () => (
          <p>
            This is where you use quantum powers: measuring your own troops in superposition and playing Quantum cards. You have neither yet. You'll learn both
            later.
          </p>
        ),
        task: () => (
          <>
            Click <b>Continue to Attack →</b>.
          </>
        ),
        allow: only("endPhase", "Click Continue to Attack → in the side bar."),
      },
      {
        title: "Phase 3: Attack",
        highlight: () => ["Core 3", "Core 2"],
        body: () => (
          <>
            <p>Attack rules:</p>
            <ul>
              <li>You attack from your sector into a connected enemy sector.</li>
              <li>
                Attack with <b>at least 3</b> troops, and leave <b>at least 1</b> behind.
              </li>
              <li>
                <b>More attackers than defenders wins.</b> Ties go to the defender.
              </li>
              <li>
                The winner loses exactly as many troops as there were defenders. The survivors move in.
              </li>
            </ul>
            <p>The side bar shows the result before you commit.</p>
          </>
        ),
        task: () => (
          <>
            Take <b>Core 2</b>: click <b>Core 3</b>, then <b>Core 2</b>, then <b>Attack</b>.
          </>
        ),
        allow: (a) => (a.type === "attack" && a.to === "Core 2" ? true : "Attack Core 2: click Core 3, then Core 2, then the red Attack button."),
        done: ({ g }) => g.owner("Core 2") === YOU,
      },
      {
        title: "Core 2 is yours",
        body: ({ g }) => {
          const e = last(g, "attack");
          return (
            <>
              <p>
                You attacked with {e?.committed} against {e?.defenders}. You lost exactly {e?.attackerLosses}, and the other {(e?.committed ?? 0) - (e?.attackerLosses ?? 0)}{" "}
                moved into Core 2. No luck involved: you knew this before you clicked.
              </p>
              <p>
                If an attack fails, all attackers are lost and the defender loses one fewer than you attacked with. A 3-against-3 attack fails, and the defender keeps 1
                troop.
              </p>
            </>
          );
        },
      },
      {
        title: "Strongholds in battle",
        highlight: () => ["Memory Controller"],
        body: () => (
          <>
            <p>
              Your Rival's <b>Memory Controller</b> has 3 troops and a shield, so it defends like 4. You would need at least 5 attackers, and the winner loses 4.
            </p>
            <p className="muted">You don't have to work this out yourself: whenever you pick an attack, the side bar shows the result, shield included, before you commit.</p>
          </>
        ),
      },
      {
        title: "Phase 4: Fortify",
        body: () => <p>Attacks are optional, and you can attack as often as you like. When you're done, move on to Fortify.</p>,
        task: () => (
          <>
            Click <b>End attacks → Fortify</b>.
          </>
        ),
        allow: only("endPhase", "Click End attacks → Fortify in the side bar."),
      },
      {
        title: "Moving troops",
        highlight: () => ["Core 0", "Core 2"],
        body: () => (
          <p>
            In Fortify you can move troops between your sectors, as often as you like. A move must follow an unbroken chain of your own sectors, and every sector
            keeps at least 1 troop. Use it to strengthen your borders.
          </p>
        ),
        task: () => (
          <>
            Move a troop: click <b>Core 0</b>, then <b>Core 2</b>, choose how many, and click <b>Move</b>.
          </>
        ),
        allow: only("fortify", "Click Core 0, then Core 2, then Move."),
      },
      {
        title: "End your turn",
        body: () => (
          <p>
            You conquered a sector this turn, so you draw a <b>sector card</b> when your turn ends. That's how cards are earned: at most one per turn, and only if you
            conquered something.
          </p>
        ),
        task: () => (
          <>
            Click <b>End turn (+1 card)</b>.
          </>
        ),
        allow: only("endTurn", "Click End turn in the side bar."),
      },
      {
        title: "Well played",
        body: () => (
          <p>
            Your first card is in the side bar. Now your Rival would take a turn, and then it's yours again. Next, let's see what the cards are for.
          </p>
        ),
      },
    ],
  },
  // ─────────────────────────────── 4 ───────────────────────────────
  {
    title: "Cards",
    steps: [
      {
        title: "Sector cards",
        setup: scenarios.cards,
        body: () => (
          <>
            <p>
              A few turns later. You've collected <b>4 sector cards</b> (side bar). Each card shows a particle (proton, neutron, electron or photon) and, except for
              photons, one sector of the board.
            </p>
            <p>
              <b>Hover over a card</b> to see it full size.
            </p>
          </>
        ),
      },
      {
        title: "Trading sets",
        body: () => (
          <>
            <p>At the start of your turn you can trade three cards for extra troops:</p>
            <ul>
              <li>
                <b>Three of a kind</b> (3 protons, 3 neutrons or 3 electrons): +4 troops
              </li>
              <li>
                <b>A full atom</b> (one proton, one neutron, one electron): +6 troops
              </li>
              <li>A photon is wild: it counts as any particle.</li>
              <li>
                Each traded card that shows a sector <b>you control</b> puts +2 troops right there.
              </li>
              <li>
                Every set also gives you a <Q>Quantum card</Q>.
              </li>
            </ul>
            <p>You can hold up to 5 sector cards. If you start a turn with 5, you must trade.</p>
          </>
        ),
      },
      {
        title: "Trade a full atom",
        highlight: () => ["Core 0", "Root Complex"],
        body: () => (
          <p>
            Your proton shows Core 0 and your neutron shows Root Complex, and you control both. So proton + neutron + electron gives +6, plus +2 on Core 0 and +2 on
            Root Complex.
          </p>
        ),
        task: () => (
          <>
            Click the <b>proton</b>, <b>neutron</b> and <b>electron</b> cards, then <b>Trade set</b>.
          </>
        ),
        allow: only("trade", "Select three cards in your hand, then click Trade set."),
      },
      {
        title: "Troops and a Quantum card",
        body: ({ g }) => {
          const e = last(g, "trade");
          return (
            <p>
              The set gave you +{e?.troops} troops to place
              {e?.ownedSectorBonus ? `, and +${e.ownedSectorBonus} were placed on the sectors shown on your cards` : ""}. You also got a Quantum card,{" "}
              <Q>Extra Split</Q>. Hover over it in your hand.
            </p>
          );
        },
      },
      {
        title: "Place your troops",
        body: () => <p>Your normal reinforcements and the set's troops are waiting.</p>,
        task: ({ g }) => (
          <>
            Place all {g.reinforcementsLeft} troops, then click <b>Place</b>.
          </>
        ),
        allow: only("place", "Click your sectors to place troops, then Place."),
        done: ({ g }) => g.reinforcementsLeft === 0,
      },
      {
        title: "Quantum cards",
        body: () => (
          <>
            <p>Quantum cards are played in your Quantum phase. They don't count toward the 5-card limit.</p>
            <ul>
              <li>
                <Q>Forced Measurement</Q>: measure one of your opponent's quantum stacks right away.
              </li>
              <li>
                <Q>Extra Split</Q>: split one more time this turn.
              </li>
            </ul>
            <p>Stacks? Splits? Time for the quantum part.</p>
          </>
        ),
      },
    ],
  },
  // ─────────────────────────────── 5 ───────────────────────────────
  {
    title: "Superposition",
    steps: [
      {
        title: "Troops in two places",
        setup: scenarios.superposition,
        body: () => (
          <>
            <p>
              Once per turn, in the Fortify phase, you can <Q>split</Q>: take troops from one sector and put them into <Q>superposition</Q> across two of your
              sectors. The result is a <Q>quantum stack</Q>.
            </p>
            <p>
              The stack is <b>entirely in one sector or entirely in the other</b>, 50/50. Nobody knows which: not your Rival, and not you.
            </p>
            <p>
              It isn't a hidden card. The answer <b>doesn't exist yet</b>. It is created when the stack is <b>measured</b>, by a real quantum computer, like a qubit
              that is only 0 or 1 once you read it.
            </p>
          </>
        ),
      },
      {
        title: "Make a split",
        highlight: () => ["Core 3", "Core 1", "Root Complex"],
        body: () => (
          <p>
            Both branches must be your sectors, connected to the source through your own sectors. The source can be one of the branches. The source keeps at least 1
            troop.
          </p>
        ),
        task: () => (
          <>
            Click <Q>ψ Split</Q>, then <b>Core 3</b> (the source), then <b>Core 1</b> and <b>Root Complex</b> (the branches). Choose how many troops with the slider (4 is a good choice) and click <b>Split</b>.
          </>
        ),
        allow: (a) => {
          if (a.type !== "split") return "Click ψ Split in the side bar, then Core 3, Core 1 and Root Complex.";
          if (a.source !== "Core 3") return "Use Core 3 as the source. Click Cancel and start again.";
          if (!(a.branches.includes("Core 1") && a.branches.includes("Root Complex"))) return "Choose Core 1 and Root Complex as the two branches.";
          if (a.size < 2 || a.size > 5) return "Use between 2 and 5 troops for this lesson (4 is a good choice).";
          return true;
        },
      },
      {
        title: "Reading a stack",
        highlight: () => ["Core 1", "Root Complex"],
        body: ({ g }) => {
          const n = g.stacks[0]?.size ?? 4;
          return (
          <>
            <p>
              Core 1 and Root Complex now both show a purple <Q>?{n}</Q> badge, joined by a dashed line. The {n} troops are in one of them.
            </p>
            <p>
              The stack is still worth only {n} troops, not {2 * n}: it only defends where it turns out to be. But your Rival has to plan for both. Quantum troops can't
              attack or move until they've been measured.
            </p>
          </>
          );
        },
      },
      {
        title: "End your turn",
        body: () => <p>Let's see how your Rival deals with your stack.</p>,
        task: () => (
          <>
            Click <b>End turn</b>.
          </>
        ),
        allow: only("endTurn", "Click End turn in the side bar."),
      },
      {
        title: "Your Rival attacks!",
        highlight: () => ["PCIe x16", "Root Complex"],
        body: ({ g }) => {
          const n = stackSize(g);
          return (
            <>
              <p>
                Your Rival attacks <b>Root Complex</b> from PCIe x16 with {n + 2} troops. When a sector with a branch is attacked, the stack is{" "}
                <Q>measured first</Q>:
              </p>
              <ul>
                <li>
                  If your {n} troops are there: 2 + {n} = {n + 2} defenders. It's a tie, so the attack fails.
                </li>
                <li>If they're in Core 1: only 2 defenders, and Root Complex falls.</li>
              </ul>
              <p className="muted">Attacking a stack also costs something: the attacker must commit at least as many troops as the stack holds.</p>
            </>
          );
        },
        script: {
          label: "Let your Rival attack",
          run: ({ g, refresh, finish }) => {
            const t1 = setTimeout(() => {
              // A real turn: the Rival reinforces its front line, skips the Quantum phase and attacks.
              g.place({ "PCIe x16": g.reinforcementsLeft });
              g.endPhase();
              g.endPhase();
              g.attack("PCIe x16", "Root Complex", stackSize(g) + 2, 0);
              refresh();
            }, 700);
            // Hand the turn back after the battle animation has played.
            const t2 = setTimeout(() => {
              g.endTurn();
              refresh();
              finish();
            }, 3400);
            return () => {
              clearTimeout(t1);
              clearTimeout(t2);
            };
          },
        },
      },
      {
        title: "The measurement decided",
        body: ({ g }) => {
          const m = last(g, "measure");
          const a = last(g, "attack");
          if (!m || !a) return <p>The battle is over.</p>;
          return a.won ? (
            <>
              <p>
                The measurement put your {m.size} troops in <b>{m.sector}</b>, so Root Complex had only 2 defenders and fell. Your Rival lost 2 and moved{" "}
                {a.committed - 2} in.
              </p>
              <p>
                But your {m.size} troops are now normal troops in Core 1. It was 50/50: your Rival could just as well have run into {m.size + 2} defenders.
              </p>
            </>
          ) : (
            <>
              <p>
                The measurement put your {m.size} troops in <b>Root Complex</b>: {a.defenders} defenders against {a.committed} attackers, and the tie goes to the
                defender. Your Rival lost all {a.attackerLosses}, and you lost {a.defenderLosses}.
              </p>
              <p>Your Rival gambled and lost. Your split covered two sectors at once, even though the troops could only ever turn up in one of them.</p>
            </>
          );
        },
      },
    ],
  },
  // ─────────────────────────────── 6 ───────────────────────────────
  {
    title: "Measurement",
    steps: [
      {
        title: "When stacks are measured",
        setup: scenarios.measurement,
        highlight: ({ g }) => g.stacks.flatMap((s) => s.branches),
        body: () => (
          <>
            <p>A new turn. You have a 4-stack on Core 1 | Root Complex, and your Rival has two stacks. A stack is measured when:</p>
            <ul>
              <li>an enemy attacks one of its sectors,</li>
              <li>its owner measures it in their Quantum phase (once per turn),</li>
              <li>
                an opponent plays <Q>Forced Measurement</Q> on it.
              </li>
            </ul>
            <p>
              Then it <b>collapses</b>: all its troops become normal troops in one of the two sectors, and the other branch disappears.
            </p>
          </>
        ),
      },
      {
        title: "Measure your own stack",
        highlight: () => ["Core 1", "Root Complex"],
        body: () => <p>Measuring your own stack turns it back into normal troops, so they can attack and move this turn. You don't get to choose where they land.</p>,
        task: () => (
          <>
            Click <b>Core 1</b> or <b>Root Complex</b> (or <b>Measure</b> in the side bar).
          </>
        ),
        allow: (a) => (a.type === "selfMeasure" ? true : "Click Core 1 or Root Complex to measure your stack."),
      },
      {
        title: "Collapsed",
        body: ({ g }) => {
          const m = last(g, "measure");
          return (
            <p>
              The result: your 4 troops are in <b>{m?.sector}</b>. That sector now has {m ? g.troops(m.sector) : "?"} normal troops. The log in the side bar shows
              every measurement and where its random bit came from. In a real game that bit comes from the Moth quantum platform.
            </p>
          );
        },
      },
      {
        title: "Forced Measurement",
        highlight: () => ["PCIe x16", "Shader Array"],
        body: () => (
          <p>
            Your Rival has 4 troops in superposition on <b>PCIe x16 | Shader Array</b>. You hold a Forced Measurement card. Use it to find out where they are before
            you plan your attacks.
          </p>
        ),
        task: () => (
          <>
            Click the <Q>Forced Measurement</Q> card in your hand, then click <b>PCIe x16</b> or <b>Shader Array</b>.
          </>
        ),
        allow: (a) =>
          a.type !== "forcedMeasurement" ? "Click the Forced Measurement card in your hand, then PCIe x16 or Shader Array." : a.stack === 103 ? true : "Measure the stack on PCIe x16 | Shader Array for this lesson.",
      },
      {
        title: "Now you know",
        body: ({ g }) => {
          const m = last(g, "measure");
          return m?.sector === "PCIe x16" ? (
            <p>
              The stack collapsed into <b>PCIe x16</b>: it now holds {g.troops("PCIe x16")} troops, plus the Stronghold shield. Better not to attack there this turn.
            </p>
          ) : (
            <p>
              The stack collapsed into <b>Shader Array</b>. PCIe x16 has only {g.troops("PCIe x16")} troops, plus the shield. Now you know exactly what an attack
              there would cost.
            </p>
          );
        },
        task: () => (
          <>
            Click <b>Continue to Attack →</b>.
          </>
        ),
        allow: only("endPhase", "Click Continue to Attack → in the side bar."),
      },
      {
        title: "Attack into uncertainty",
        highlight: () => ["Memory Controller", "Memory Bus"],
        body: () => (
          <>
            <p>
              <b>Memory Bus</b> has 2 normal troops and maybe your Rival's 3-stack, so either 2 or 5 defenders. Because a stack might be there, you must attack with at
              least 3 (the stack's size).
            </p>
            <p>The side bar shows both possible results. Attack with 7 to win either way, or with fewer to take a chance.</p>
          </>
        ),
        task: () => (
          <>
            Click <b>Memory Controller</b>, then <b>Memory Bus</b>, choose your attackers and click <b>Attack</b>.
          </>
        ),
        allow: (a) => (a.type === "attack" && a.to === "Memory Bus" ? true : "Attack Memory Bus: click Memory Controller, then Memory Bus."),
      },
      {
        title: "The result",
        body: ({ g }) => {
          const m = last(g, "measure");
          const a = last(g, "attack");
          if (!a) return null;
          const here = m?.sector === "Memory Bus";
          return (
            <p>
              The stack was {here ? <b>there</b> : <b>in DIMM A1</b>}, so you faced {a.defenders} defenders with {a.committed} attackers.{" "}
              {a.won ? `You took Memory Bus and lost ${a.attackerLosses}.` : `The Memory Bus held: you lost ${a.attackerLosses}, your Rival lost ${a.defenderLosses}.`}
            </p>
          );
        },
      },
      {
        title: "Tips",
        body: () => (
          <ul className="tips">
            <li>A split threatens two places but defends only one. Use it to cover two borders when you can only afford one.</li>
            <li>Against a stack, either attack with enough to win both ways, or measure it first with a Forced Measurement.</li>
            <li>The probe rule makes big stacks expensive to test: an attacker must commit at least the stack's size.</li>
            <li>Measuring your own stack in the Quantum phase gets the troops back for this turn's attacks.</li>
            <li>Bonuses and sector counts only use normal troops: a branch never holds a sector on its own.</li>
          </ul>
        ),
      },
    ],
  },
  // ─────────────────────────────── 7 ───────────────────────────────
  {
    title: "Ready",
    steps: [
      {
        title: "You're ready",
        slide: { art: "title" },
        body: () => (
          <>
            <p>A turn, in short:</p>
            <ol>
              <li>
                <b>Reinforce</b>: sectors ÷ 3 (at least 3), cluster bonuses, card sets.
              </li>
              <li>
                <b>Quantum</b>: measure one of your stacks, play Quantum cards.
              </li>
              <li>
                <b>Attack</b>: more attackers than defenders wins. No dice.
              </li>
              <li>
                <b>Fortify</b>: move troops, and <Q>split</Q> once.
              </li>
            </ol>
            <p>
              Complete your secret mission before anyone else. Start a game against bots from the menu. The full rules are in the{" "}
              <a href="https://github.com/vincentschall/quantumrisk/blob/main/RULEBOOK.md" target="_blank" rel="noreferrer">
                rulebook
              </a>
              .
            </p>
          </>
        ),
      },
    ],
  },
];
