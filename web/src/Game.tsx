import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerId } from "../../src/engine/types.js";
import type { Action, GameView, PlayerView } from "../../src/server/protocol.js";
import { Board, type Effect } from "./Board.js";
import type { BoardMap } from "./net.js";
import { battle, colorOf, describe, geometry, minCommit, missionText, NEUTRAL, PARTICLE, QUANTUM, reachableOwned, sourceLabel, stacksAt } from "./rules.js";

type Tool =
  | { kind: "none" }
  | { kind: "attack"; from?: string; to?: string; committed?: number; moveExtra?: number }
  | { kind: "move"; from?: string; to?: string; n?: number }
  | { kind: "split"; source?: string; branches: string[]; size?: number }
  | { kind: "forced" };

const PHASES = ["reinforce", "quantum", "attack", "fortify"] as const;
const PHASE_LABEL: Record<string, string> = { setup: "Setup", reinforce: "Reinforce", quantum: "Quantum", attack: "Attack", fortify: "Fortify", gameOver: "Game over" };

export function GameScreen({ view, map, act, inviteUrl }: { view: GameView; map: BoardMap; act(a: Action): void; inviteUrl: string }) {
  const geo = useMemo(() => geometry(map), [map]);
  const [tool, setTool] = useState<Tool>({ kind: "none" });
  const [pending, setPending] = useState<Record<string, number>>({});
  const [tradeSel, setTradeSel] = useState<number[]>([]);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [revealed, setRevealed] = useState<PlayerId | null>(null);
  const seen = useRef(view.logLength);
  const prevStacks = useRef(view.stacks);
  const fxId = useRef(0);

  const me = view.current;
  const myTurn = view.you.includes(me) && view.phase !== "gameOver";
  const hotSeat = view.you.length > 1;
  const setup = view.phase === "setup";
  // Hot-seat: hide the previous player's secrets until the next player confirms they have the screen.
  const curtain = myTurn && hotSeat && !setup && revealed !== me && view.you.filter((p) => view.players[p]?.alive).length > 1;
  const canAct = myTurn && !curtain;
  // Whose secrets to show: the local player whose turn it is, or your only seat online.
  const privateSeat: PlayerId | null = hotSeat ? (canAct && !setup ? me : null) : (view.you[0] ?? null);
  const name = (p: PlayerId) => (p === NEUTRAL ? "Neutral" : (view.players[p]?.name ?? `P${p + 1}`));

  // Reset local selections whenever the turn or phase changes.
  const phaseKey = `${view.current}:${view.phase}:${view.round}`;
  useEffect(() => {
    setTool({ kind: view.phase === "attack" ? "attack" : view.phase === "fortify" ? "move" : "none" });
    setPending({});
    setTradeSel([]);
  }, [phaseKey]);

  // Placed troops arrive from the server: drop the local preview.
  useEffect(() => setPending({}), [view.reinforcementsLeft, view.setupRemaining.join(",")]);

  // Turn new log events into short board animations.
  useEffect(() => {
    const count = Math.min(view.logLength - seen.current, view.log.length);
    const fresh = count > 0 ? view.log.slice(-count) : [];
    seen.current = view.logLength;
    const before = prevStacks.current;
    prevStacks.current = view.stacks;
    if (!fresh.length) return;
    const add: Effect[] = [];
    for (const e of fresh) {
      if (e.type === "measure") {
        add.push({ id: ++fxId.current, kind: "collapse", sector: e.sector, text: `${e.size} here` });
        const st = before.find((x) => x.id === e.stack);
        if (st) {
          const other = st.branches.find((b) => b !== e.sector);
          if (other) add.push({ id: ++fxId.current, kind: "vanish", sector: other });
        }
      } else if (e.type === "attack") {
        add.push({ id: ++fxId.current, kind: "attack", sector: e.to, from: e.from, color: colorOf(e.player), won: e.won, text: e.won ? `taken −${e.attackerLosses}` : `held −${e.defenderLosses}` });
      }
    }
    if (!add.length) return;
    setEffects((fx) => [...fx, ...add]);
    const ids = new Set(add.map((a) => a.id));
    const t = setTimeout(() => setEffects((fx) => fx.filter((f) => !ids.has(f.id))), 2600);
    return () => clearTimeout(t);
  }, [view.logLength]);

  const owner = (s: string) => view.sectors[s]?.owner;
  const troops = (s: string) => view.sectors[s]?.troops ?? 0;
  const pendingTotal = Object.values(pending).reduce((a, b) => a + b, 0);
  const placeBudget = view.phase === "setup" ? Math.min(view.setupChunk, view.setupRemaining[me] ?? 0) : view.reinforcementsLeft;
  const player = view.players[me]!;

  // Which sectors can be clicked, and what clicking does.
  const { selectable, selected } = useMemo(() => {
    const sel = new Set<string>();
    let chosen: string[] = [];
    if (!canAct) return { selectable: sel, selected: chosen };
    const mine = Object.keys(view.sectors).filter((s) => owner(s) === me);
    if (view.phase === "setup" || view.phase === "reinforce") mine.forEach((s) => sel.add(s));
    else if (tool.kind === "attack") {
      if (!tool.from) mine.filter((s) => troops(s) > view.minAttack).forEach((s) => sel.add(s));
      else {
        chosen = [tool.from, ...(tool.to ? [tool.to] : [])];
        sel.add(tool.from);
        for (const n of geo.adjacency.get(tool.from) ?? []) if (owner(n) !== me) sel.add(n);
        mine.filter((s) => troops(s) > view.minAttack).forEach((s) => sel.add(s));
      }
    } else if (tool.kind === "move") {
      if (!tool.from) mine.filter((s) => troops(s) > 1).forEach((s) => sel.add(s));
      else {
        chosen = [tool.from, ...(tool.to ? [tool.to] : [])];
        reachableOwned(view, geo, tool.from, me).forEach((s) => sel.add(s));
      }
    } else if (tool.kind === "split") {
      if (!tool.source) mine.filter((s) => troops(s) > 1).forEach((s) => sel.add(s));
      else {
        chosen = [tool.source, ...tool.branches];
        sel.add(tool.source);
        reachableOwned(view, geo, tool.source, me).forEach((s) => stacksAt(view, s).length === 0 && sel.add(s));
        tool.branches.forEach((b) => sel.add(b));
      }
    } else if (tool.kind === "forced") view.stacks.filter((st) => st.owner !== me).forEach((st) => st.branches.forEach((b) => sel.add(b)));
    else if (view.phase === "quantum") view.stacks.filter((st) => st.owner === me).forEach((st) => st.branches.forEach((b) => sel.add(b)));
    return { selectable: sel, selected: chosen };
  }, [view, tool, canAct, geo]);

  function onSector(s: string, e: React.MouseEvent) {
    e.preventDefault();
    if (!canAct || !selectable.has(s)) return;
    const remove = e.type === "contextmenu";
    if (view.phase === "setup" || view.phase === "reinforce") {
      setPending((p) => {
        const cur = p[s] ?? 0;
        const left = placeBudget - pendingTotal;
        const next = remove ? Math.max(0, cur - 1) : cur + (e.shiftKey ? left : Math.min(1, left));
        return { ...p, [s]: next };
      });
      return;
    }
    if (tool.kind === "attack") {
      if (owner(s) === me) setTool({ kind: "attack", from: s });
      else if (tool.from) {
        const min = minCommit(view, s);
        const max = troops(tool.from) - 1;
        setTool({ ...tool, to: s, committed: Math.min(max, Math.max(min, max)), moveExtra: 0 });
      }
    } else if (tool.kind === "move") {
      if (!tool.from || s === tool.from) setTool({ kind: "move", from: tool.from === s ? undefined : s });
      else setTool({ ...tool, to: s, n: troops(tool.from) - 1 });
    } else if (tool.kind === "split") {
      if (!tool.source) setTool({ kind: "split", source: s, branches: [], size: Math.max(1, Math.floor((troops(s) - 1) / 2)) });
      else if (tool.branches.includes(s)) setTool({ ...tool, branches: tool.branches.filter((b) => b !== s) });
      else if (tool.branches.length < 2) setTool({ ...tool, branches: [...tool.branches, s] });
    } else if (tool.kind === "forced") {
      const st = stacksAt(view, s).find((x) => x.owner !== me);
      if (st) {
        act({ type: "forcedMeasurement", stack: st.id });
        setTool({ kind: "none" });
      }
    } else if (view.phase === "quantum") {
      const st = stacksAt(view, s).find((x) => x.owner === me);
      if (st && !view.quantumActionUsed) act({ type: "selfMeasure", stack: st.id });
    }
  }

  const clean = (p: Record<string, number>) => Object.fromEntries(Object.entries(p).filter(([, n]) => n > 0));

  return (
    <div className="game">
      <div className="board-wrap">
        <Board map={map} geo={geo} view={view} selectable={selectable} selected={selected} pending={pending} effects={effects} onSector={onSector} />
        {curtain && (
          <div className="curtain">
            <div className="curtain-card" style={{ borderColor: colorOf(me) }}>
              <p>Pass the screen to</p>
              <h2 style={{ color: colorOf(me) }}>{player.name}</h2>
              <button className="primary" onClick={() => setRevealed(me)}>
                I'm {player.name}: show my turn
              </button>
            </div>
          </div>
        )}
        {view.phase === "gameOver" && <GameOver view={view} />}
      </div>

      <aside className="side">
        <header className="brand">
          <span className="ket">|QuantumRisk⟩</span>
          <span className="meta">
            {view.mode === "missions" ? "Missions" : "Domination"} · round {view.round || 1}
          </span>
        </header>

        <Players view={view} />

        <section className="panel turn">
          <div className="phases">
            {view.phase === "setup" ? (
              <span className="phase active">Setup</span>
            ) : (
              PHASES.map((p) => (
                <span key={p} className={`phase ${view.phase === p ? "active" : ""}`}>
                  {PHASE_LABEL[p]}
                </span>
              ))
            )}
          </div>
          <h3 style={{ color: colorOf(me) }}>
            {name(me)}
            {view.you.includes(me) ? "" : view.players[me]?.kind === "bot" ? " (bot) is thinking…" : " is playing…"}
          </h3>
          {canAct && (
            <TurnControls
              view={view}
              tool={tool}
              setTool={setTool}
              pending={pending}
              setPending={setPending}
              placeBudget={placeBudget}
              pendingTotal={pendingTotal}
              act={act}
              clean={clean}
              geo={geo}
            />
          )}
        </section>

        {privateSeat !== null && (
          <Hand view={view} seat={privateSeat} canTrade={canAct && view.phase === "reinforce"} tradeSel={tradeSel} setTradeSel={setTradeSel} act={act} canPlay={canAct && view.phase === "quantum"} setTool={setTool} />
        )}

        {view.players.some((p) => p.open) && (
          <section className="panel invite">
            <h4>Invite</h4>
            <p>Send this link to fill the open seats:</p>
            <input readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
          </section>
        )}

        <Log view={view} name={name} />
      </aside>
    </div>
  );
}

function TurnControls(props: {
  view: GameView;
  tool: Tool;
  setTool(t: Tool): void;
  pending: Record<string, number>;
  setPending(p: Record<string, number>): void;
  placeBudget: number;
  pendingTotal: number;
  act(a: Action): void;
  clean(p: Record<string, number>): Record<string, number>;
  geo: ReturnType<typeof geometry>;
}) {
  const { view, tool, setTool, pending, setPending, placeBudget, pendingTotal, act, clean, geo } = props;
  const me = view.current;
  const pl = view.players[me]!;
  const troops = (s: string) => view.sectors[s]?.troops ?? 0;

  if (view.phase === "setup" || view.phase === "reinforce") {
    const mustTrade = view.phase === "reinforce" && (pl.cards?.length ?? 0) >= view.handLimit;
    const left = placeBudget - pendingTotal;
    return (
      <div className="controls">
        <p className="hint">
          {view.phase === "setup"
            ? `Place ${placeBudget} troop${placeBudget === 1 ? "" : "s"} on your sectors.`
            : mustTrade
              ? `You hold ${view.handLimit} cards: trade a set first (below).`
              : view.reinforcementsLeft > 0
                ? `Place your ${view.reinforcementsLeft} new troops.`
                : "All troops placed."}{" "}
          {(view.phase === "setup" || view.reinforcementsLeft > 0) && "Click a sector to add 1, shift-click to add all, right-click to remove."}
        </p>
        <div className="counter">{left} left to place</div>
        <div className="row">
          <button disabled={pendingTotal === 0} onClick={() => setPending({})}>
            Reset
          </button>
          {view.phase === "setup" ? (
            <button className="primary" disabled={left !== 0} onClick={() => act({ type: "setupPlace", placements: clean(pending) })}>
              Confirm
            </button>
          ) : view.reinforcementsLeft > 0 ? (
            <button className="primary" disabled={pendingTotal === 0 || mustTrade} onClick={() => act({ type: "place", placements: clean(pending) })}>
              Place {pendingTotal}
            </button>
          ) : (
            <button className="primary" disabled={mustTrade} onClick={() => act({ type: "endPhase" })}>
              Continue to Quantum →
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view.phase === "quantum") {
    const mine = view.stacks.filter((s) => s.owner === me);
    const enemy = view.stacks.filter((s) => s.owner !== me);
    return (
      <div className="controls">
        <p className="hint">Optional. Self-measure one of your stacks (click one of its sectors), or play Quantum cards from your hand.</p>
        {tool.kind === "forced" && (
          <p className="hint quantum">Click a sector holding an enemy branch to measure that stack. {enemy.length === 0 && "(No enemy stacks.)"}</p>
        )}
        <ul className="stacks">
          {mine.map((st) => (
            <li key={st.id}>
              <span className="q">?{st.size}</span> {st.branches[0]} | {st.branches[1]}
              <button disabled={view.quantumActionUsed} onClick={() => act({ type: "selfMeasure", stack: st.id })}>
                Measure
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          {tool.kind === "forced" && <button onClick={() => setTool({ kind: "none" })}>Cancel</button>}
          <button className="primary" onClick={() => act({ type: "endPhase" })}>
            Continue to Attack →
          </button>
        </div>
      </div>
    );
  }

  if (view.phase === "attack" || view.phase === "fortify") {
    const isAttack = tool.kind === "attack" && view.phase === "attack";
    return (
      <div className="controls">
        <div className="tools">
          {view.phase === "attack" && (
            <button className={tool.kind === "attack" ? "on" : ""} onClick={() => setTool({ kind: "attack" })}>
              ⚔ Attack
            </button>
          )}
          <button className={tool.kind === "move" ? "on" : ""} onClick={() => setTool({ kind: "move" })}>
            ⇄ Move
          </button>
          <button className={tool.kind === "split" ? "on quantum" : "quantum"} disabled={!view.canSplit} onClick={() => setTool({ kind: "split", branches: [] })}>
            ψ Split{view.canSplit ? ` (${view.splitsLeft})` : ""}
          </button>
        </div>
        {view.phase === "attack" && tool.kind !== "attack" && <p className="hint">Moving or splitting ends your attacks for this turn.</p>}

        {isAttack && tool.kind === "attack" && <AttackPanel view={view} tool={tool} setTool={setTool} act={act} strongholds={geo.strongholds} />}
        {tool.kind === "move" && (
          <div>
            {!tool.from && <p className="hint">Click a sector to move troops from (along a chain of your sectors).</p>}
            {tool.from && !tool.to && <p className="hint">From {tool.from}: click where to move them.</p>}
            {tool.from && tool.to && (
              <>
                <p>
                  Move from <b>{tool.from}</b> to <b>{tool.to}</b>
                </p>
                <Slider value={tool.n ?? 1} min={1} max={troops(tool.from) - 1} onChange={(n) => setTool({ ...tool, n })} />
                <div className="row">
                  <button onClick={() => setTool({ kind: "move" })}>Cancel</button>
                  <button className="primary" onClick={() => (act({ type: "fortify", from: tool.from!, to: tool.to!, n: tool.n ?? 1 }), setTool({ kind: "move" }))}>
                    Move {tool.n}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {tool.kind === "split" && (
          <div>
            {!tool.source && <p className="hint quantum">Click the sector whose troops you want to put into superposition.</p>}
            {tool.source && tool.branches.length < 2 && (
              <p className="hint quantum">
                Click {2 - tool.branches.length} sector{tool.branches.length === 1 ? "" : "s"} for the branches: yours, connected to {tool.source} through your sectors, without a branch yet.
                The source itself counts.
              </p>
            )}
            {tool.source && (
              <>
                <p>
                  Stack from <b>{tool.source}</b>: {tool.branches[0] ?? "…"} | {tool.branches[1] ?? "…"}
                </p>
                <Slider value={tool.size ?? 1} min={1} max={troops(tool.source) - 1} onChange={(size) => setTool({ ...tool, size })} label="troops" />
                <div className="row">
                  <button onClick={() => setTool({ kind: "split", branches: [] })}>Cancel</button>
                  <button
                    className="primary quantum"
                    disabled={tool.branches.length !== 2}
                    onClick={() => (act({ type: "split", source: tool.source!, size: tool.size ?? 1, branches: [tool.branches[0]!, tool.branches[1]!] }), setTool({ kind: "move" }))}
                  >
                    Split {tool.size}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <div className="row end">
          {view.phase === "attack" && (
            <button onClick={() => act({ type: "endPhase" })}>
              End attacks → Fortify
            </button>
          )}
          <button className="primary" onClick={() => act({ type: "endTurn" })}>
            End turn{view.conqueredThisTurn ? " (+1 card)" : ""}
          </button>
        </div>
        <p className="hint small">{geo.strongholds.size} Strongholds (heatsink icon) defend with +{view.strongholdBonus}.</p>
      </div>
    );
  }
  return null;
}

function AttackPanel({ view, tool, setTool, act, strongholds }: { view: GameView; tool: Extract<Tool, { kind: "attack" }>; setTool(t: Tool): void; act(a: Action): void; strongholds: Set<string> }) {
  if (!tool.from) return <p className="hint">Click one of your sectors with more than {view.minAttack} troops to attack from.</p>;
  if (!tool.to) return <p className="hint">From {tool.from}: click an adjacent enemy sector. Minimum attack {view.minAttack}.</p>;
  const from = tool.from;
  const to = tool.to;
  const max = (view.sectors[from]?.troops ?? 0) - 1;
  const min = minCommit(view, to);
  const n = tool.committed ?? max;
  const extraMax = Math.max(0, max - n);
  const extra = Math.min(tool.moveExtra ?? 0, extraMax);
  const defenders = view.sectors[to]?.troops ?? 0;
  const stronghold = strongholds.has(to);
  const stacks = stacksAt(view, to);
  const outcome = (d: number) => battle(n, d, stronghold, view.strongholdBonus, extra);
  const line = (o: ReturnType<typeof outcome>) =>
    o.won ? `you take it: lose ${o.attackerLosses}, move in ${o.movedIn}` : `it holds: you lose ${o.attackerLosses}, they lose ${o.defenderLosses}`;
  if (max < min)
    return (
      <div>
        <p className="hint warn">
          {from} → {to}: you need at least {min} attackers{stacks.length ? " (a quantum branch is here, so you must commit at least its size)" : ""}, but can commit only {max}.
        </p>
        <button onClick={() => setTool({ kind: "attack" })}>Cancel</button>
      </div>
    );
  return (
    <div className="attack">
      <p>
        <b>{from}</b> → <b>{to}</b>: {defenders} defender{defenders === 1 ? "" : "s"}
        {stronghold ? ` +${view.strongholdBonus} Stronghold` : ""}
      </p>
      <Slider value={n} min={min} max={max} onChange={(c) => setTool({ ...tool, committed: c })} label="attackers" />
      {extraMax > 0 && <Slider value={extra} min={0} max={extraMax} onChange={(m) => setTool({ ...tool, moveExtra: m })} label="extra to move in if you win" />}
      {stacks.length === 0 ? (
        <p className={outcome(defenders).won ? "good" : "bad"}>Result: {line(outcome(defenders))}</p>
      ) : (
        <div className="quantum-outcomes">
          <p className="quantum">A branch of {stacks[0]!.size} troops is here. Attacking measures it: 50/50.</p>
          <p className={outcome(defenders + stacks[0]!.size).won ? "good" : "bad"}>If the stack is here: {line(outcome(defenders + stacks[0]!.size))}</p>
          <p className={outcome(defenders).won ? "good" : "bad"}>If it's in the other sector: {line(outcome(defenders))}</p>
        </div>
      )}
      <div className="row">
        <button onClick={() => setTool({ kind: "attack" })}>Cancel</button>
        <button className="primary danger" onClick={() => (act({ type: "attack", from, to, committed: n, moveExtra: extra }), setTool({ kind: "attack" }))}>
          Attack with {n}
        </button>
      </div>
    </div>
  );
}

function Slider({ value, min, max, onChange, label = "" }: { value: number; min: number; max: number; onChange(n: number): void; label?: string }) {
  const v = Math.min(Math.max(value, min), max);
  return (
    <label className="slider">
      <input type="range" min={min} max={max} value={v} onChange={(e) => onChange(Number(e.target.value))} disabled={min === max} />
      <span>
        <b>{v}</b> {label}
      </span>
    </label>
  );
}

function Players({ view }: { view: GameView }) {
  return (
    <section className="panel players">
      {view.players.map((p) => (
        <div key={p.id} className={`player ${p.id === view.current && view.phase !== "gameOver" ? "current" : ""} ${p.alive ? "" : "dead"}`} style={{ borderColor: colorOf(p.id) }}>
          <span className="dot" style={{ background: colorOf(p.id) }} />
          <span className="pmain">
          <span className="pname">
            {p.name}
            {p.kind === "bot" && <em> bot</em>}
            {view.you.includes(p.id) && <em> you</em>}
            {p.open && <em> open seat</em>}
            {!p.connected && !p.open && <em> offline</em>}
          </span>
          <span className="stats">
            {p.sectors} sectors · {p.troops} troops · {p.cardCount} card{p.cardCount === 1 ? "" : "s"} · +{p.reinforcement}/turn
          </span>
          </span>
        </div>
      ))}
    </section>
  );
}

function Hand(props: {
  view: GameView;
  seat: PlayerId;
  canTrade: boolean;
  canPlay: boolean;
  tradeSel: number[];
  setTradeSel(s: number[]): void;
  act(a: Action): void;
  setTool(t: Tool): void;
}) {
  const { view, seat, canTrade, canPlay, tradeSel, setTradeSel, act, setTool } = props;
  const p = view.players[seat]!;
  const cards = p.cards ?? [];
  const isSet = (sel: number[]) => (p.sets ?? []).some((s) => s.length === sel.length && s.every((i) => sel.includes(i)));
  return (
    <section className="panel hand">
      {view.mode === "missions" && (
        <div className="mission">
          <h4>Secret mission</h4>
          <p>{missionText(p.mission, view.players)}</p>
        </div>
      )}
      <h4>
        Sector cards <span className="muted">({cards.length}/{view.handLimit})</span>
      </h4>
      <div className="cards">
        {cards.length === 0 && <p className="muted small">Conquer a sector in your turn to draw a card.</p>}
        {cards.map((c, i) => {
          const pt = PARTICLE[c.particle];
          const on = tradeSel.includes(i);
          return (
            <button
              key={i}
              className={`card ${on ? "on" : ""}`}
              disabled={!canTrade}
              style={{ borderColor: pt.color }}
              onClick={() => setTradeSel(on ? tradeSel.filter((x) => x !== i) : tradeSel.length < 3 ? [...tradeSel, i] : tradeSel)}
              title={pt.name}
            >
              <span className="particle" style={{ color: pt.color }}>
                {pt.symbol}
              </span>
              <span className="csector">{c.sector ?? "wild"}</span>
              {c.sector && view.sectors[c.sector]?.owner === seat && <span className="owned">+2</span>}
            </button>
          );
        })}
      </div>
      {canTrade && cards.length >= 3 && (
        <div className="row">
          <button disabled={!(p.sets ?? []).length} onClick={() => setTradeSel(p.sets?.[0] ?? [])}>
            Pick a set
          </button>
          <button className="primary" disabled={tradeSel.length !== 3 || !isSet(tradeSel)} onClick={() => (act({ type: "trade", indices: tradeSel as [number, number, number] }), setTradeSel([]))}>
            Trade set
          </button>
        </div>
      )}
      {canTrade && <p className="muted small">Three of a kind +4 · one of each +6 · photons are wild · each card showing a sector you own: +2 there · every set also gives a Quantum card.</p>}
      <h4>Quantum cards</h4>
      <div className="qcards">
        {(p.quantumCards ?? []).length === 0 && <p className="muted small">Trade a set of sector cards to get one.</p>}
        {(p.quantumCards ?? []).map((q, i) => (
          <button
            key={i}
            className="qcard"
            disabled={!canPlay || (q === "forcedMeasurement" && !view.stacks.some((s) => s.owner !== seat))}
            onClick={() => (q === "forcedMeasurement" ? setTool({ kind: "forced" }) : act({ type: "extraSplit" }))}
            style={{ borderColor: QUANTUM }}
          >
            {q === "forcedMeasurement" ? "⟨M⟩ Forced Measurement" : "ψ Extra Split"}
          </button>
        ))}
      </div>
    </section>
  );
}

function Log({ view, name }: { view: GameView; name(p: PlayerId): string }) {
  const lines = useMemo(() => {
    const out: { text: string; color: string; quantum?: string }[] = [];
    for (const e of view.log) {
      const text = describe(e, name);
      if (!text) continue;
      const who = "player" in e ? e.player : "owner" in e ? e.owner : NEUTRAL;
      out.push({ text, color: colorOf(who), quantum: e.type === "measure" ? sourceLabel(e.source) : undefined });
    }
    return out.slice(-60).reverse();
  }, [view.logLength, view.players]);
  return (
    <section className="panel log">
      <h4>Log</h4>
      <ol>
        {lines.map((l, i) => (
          <li key={view.logLength - i} style={{ borderColor: l.color }} className={l.quantum ? "qline" : ""}>
            {l.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

function GameOver({ view }: { view: GameView }) {
  const w = view.winner !== null ? view.players[view.winner] : null;
  const win = [...view.log].reverse().find((e) => e.type === "win");
  return (
    <div className="curtain">
      <div className="curtain-card" style={{ borderColor: w ? colorOf(w.id) : "#888" }}>
        <p>Game over</p>
        <h2 style={{ color: w ? colorOf(w.id) : undefined }}>{w ? `${w.name} wins` : "No winner"}</h2>
        {win?.type === "win" && <p>{win.reason === "mission" ? `Mission: ${missionText(w?.mission, view.players)}` : "by Global Domination"}</p>}
        {view.mode === "missions" && (
          <ul className="missions">
            {view.players.map((p: PlayerView) => (
              <li key={p.id} style={{ color: colorOf(p.id) }}>
                {p.name}: {missionText(p.mission, view.players)}
              </li>
            ))}
          </ul>
        )}
        <a className="button primary" href={location.pathname}>
          New game
        </a>
      </div>
    </div>
  );
}
