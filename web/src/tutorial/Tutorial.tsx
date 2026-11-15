import { useEffect, useMemo, useRef, useState } from "react";
import type { Game } from "../../../src/engine/index.js";
import type { Action } from "../../../src/server/protocol.js";
import { applyAction, buildView } from "../../../src/server/view.js";
import { GameScreen } from "../Game.js";
import { CHAPTERS, type Step } from "./steps.js";
import { TUTORIAL_MAP } from "./map.js";

/** Every step in order, with its chapter. */
const FLAT = CHAPTERS.flatMap((c, ci) => c.steps.map((s, si) => ({ step: s, chapter: ci, index: si })));
const chapterStart = (ci: number) => FLAT.findIndex((f) => f.chapter === ci);

const SEATS = [
  { name: "Player", kind: "human" as const, claimed: true },
  { name: "Rival", kind: "bot" as const, claimed: true },
];
const art = (name: string) => `${import.meta.env.BASE_URL}art/${name}.webp`;

/** The interactive tutorial: scripted lessons played on the real board with the real rules engine. */
export function Tutorial({ onExit }: { onExit(): void }) {
  const [pos, setPos] = useState(0);
  const game = useRef<Game>(FLAT[0]!.step.setup!());
  const [gameId, setGameId] = useState(0);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const { step, chapter, index } = FLAT[pos]!;
  const g = game.current;
  const refresh = () => setVersion((v) => v + 1);

  const goto = (p: number) => {
    const target = FLAT[p];
    if (!target) return;
    if (target.step.setup) {
      game.current = target.step.setup();
      setGameId((id) => id + 1);
    }
    setMessage(null);
    setPos(p);
    refresh();
  };
  const next = () => goto(pos + 1);

  // Scripted events (the Rival's turn) start when the player clicks the step's button.
  const [script, setScript] = useState<"idle" | "running" | "done">("idle");
  const stopScript = useRef<(() => void) | null>(null);
  useEffect(() => {
    setScript("idle");
    return () => {
      stopScript.current?.();
      stopScript.current = null;
    };
  }, [pos, gameId]);
  const runScript = () => {
    if (!step.script || script !== "idle") return;
    setScript("running");
    stopScript.current = step.script.run({ g: game.current, refresh, finish: () => setScript("done") });
  };

  const view = useMemo(() => buildView(g, { room: "tutorial", mode: "missions", seats: SEATS, you: new Set([0]), connected: new Set([0]) }), [g, version]);

  function act(a: Action) {
    if (!step.allow) {
      setMessage(step.script ? "It's your Rival's turn: watch their move, then click Next." : "Read the tip, then click Next.");
      return;
    }
    const ok = step.allow(a, { g });
    if (ok !== true) {
      setMessage(ok);
      return;
    }
    try {
      applyAction(g, a);
    } catch (e) {
      setMessage((e as Error).message);
      return;
    }
    setMessage(null);
    refresh();
    if (!step.done || step.done({ g })) next();
  }

  const prev = FLAT[pos - 1];
  // Going back is only safe across explanation steps: no move happened in between.
  const canBack = !!prev && prev.chapter === chapter && !prev.step.allow && !prev.step.script && !step.script;
  const isLast = pos === FLAT.length - 1;
  const highlight = useMemo(() => new Set(step.highlight?.({ g }) ?? []), [step, g, version]);

  const nav = (
    <nav className="coach-chapters" aria-label="Chapters">
      {CHAPTERS.map((c, i) => (
        <button key={c.title} className={i === chapter ? "on" : i < chapter ? "done" : ""} onClick={() => goto(chapterStart(i))} title={c.title}>
          {i + 1}
        </button>
      ))}
    </nav>
  );
  const buttons = (
    <div className="row coach-buttons">
      {canBack && <button onClick={() => goto(pos - 1)}>← Back</button>}
      {step.script && script === "idle" && (
        <button className="primary" onClick={runScript}>
          {step.script.label} →
        </button>
      )}
      {!step.allow && (!step.script || script === "done") && !isLast && (
        <button className="primary" onClick={next}>
          Next →
        </button>
      )}
      {isLast && (
        <button className="primary" onClick={onExit}>
          Back to menu
        </button>
      )}
    </div>
  );
  const content = (
    <>
      <h3>{step.title}</h3>
      <div className="coach-body">{step.body({ g })}</div>
      {step.task && <p className="coach-task">▶ {step.task({ g })}</p>}
      {script === "running" && <p className="coach-wait">Your Rival is moving…</p>}
      {script === "done" && <p className="coach-task">▶ The Rival's turn is over. Look at the board, then click Next.</p>}
      {message && <p className="coach-msg">{message}</p>}
    </>
  );
  const header = (
    <div className="coach-top">
      <span className="coach-chapter">
        Tutorial · {CHAPTERS[chapter]!.title} · {index + 1}/{CHAPTERS[chapter]!.steps.length}
      </span>
      <button className="link" onClick={onExit}>
        Back to menu
      </button>
    </div>
  );

  return (
    <GameScreen
      key={gameId}
      view={view}
      map={TUTORIAL_MAP}
      act={act}
      inviteUrl=""
      tutorial={{
        highlight,
        dim: step.dim,
        coach: step.slide ? undefined : (
          <section className="panel coach" key={pos}>
            {header}
            {nav}
            {content}
            {buttons}
          </section>
        ),
        overlay: step.slide ? <Slide step={step} header={header} nav={nav} content={content} buttons={buttons} /> : undefined,
      }}
    />
  );
}

function Slide({ step, header, nav, content, buttons }: { step: Step; header: React.ReactNode; nav: React.ReactNode; content: React.ReactNode; buttons: React.ReactNode }) {
  return (
    <div className="tut-slide">
      <div className="tut-slide-card">
        <img src={art(step.slide!.art)} alt="" />
        <div className="tut-slide-text">
          {header}
          {nav}
          {content}
          {buttons}
        </div>
      </div>
    </div>
  );
}
